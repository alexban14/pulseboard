# 07 — Data Pipeline & Warehouse

## Warehouse Architecture

Each tenant gets a **logically isolated** data space in the warehouse.
The platform manages data in layers:

```
┌──────────────────────────────────────────────────────────┐
│                    PER-TENANT WAREHOUSE                    │
│                                                          │
│  ┌── CACHE LAYER (Redis) ───────────────────────────────┐│
│  │  Query result cache, keyed by query hash + tenant     ││
│  │  TTL: configurable (30s to 24h)                       ││
│  └───────────────────────────────────────────────────────┘│
│                                                          │
│  ┌── AGGREGATION LAYER (TimescaleDB) ───────────────────┐│
│  │  Continuous aggregates for time-series rollups         ││
│  │  Auto-refreshed on new data arrival                   ││
│  │  Tenant-scoped, auto-generated from semantic model    ││
│  └───────────────────────────────────────────────────────┘│
│                                                          │
│  ┌── RAW LAYER (PostgreSQL) ────────────────────────────┐│
│  │  1:1 copies of source tables (cleaned, typed)         ││
│  │  Schema: warehouse_{tenant_short_id}                  ││
│  │  Tables: raw_{connector}_{source_table}               ││
│  │  All tables have: _synced_at, _source_id columns      ││
│  └───────────────────────────────────────────────────────┘│
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Why Not a Separate OLAP Engine?

At our target scale (SMBs, < 10M rows per tenant), PostgreSQL + TimescaleDB is
sufficient and avoids operational complexity:

| Approach | When to Consider |
|----------|-----------------|
| **PostgreSQL + TimescaleDB** (our choice) | < 10M rows per tenant, < 100 tenants. Simple, reliable, single DB to manage. |
| **ClickHouse** | > 100M rows per tenant, heavy aggregation workloads. Adds operational complexity. |
| **DuckDB (embedded)** | Per-query analytical engine, no persistent store needed. Good for serverless. |
| **BigQuery / Snowflake** | Enterprise scale, multi-TB datasets. Expensive, cloud-locked. |

We start with PostgreSQL. The query engine is abstracted behind an interface,
so swapping to ClickHouse later is a service-level change, not an architectural one.

---

## Warehouse Schema Per Tenant

```sql
-- Platform creates a schema per tenant on onboarding
CREATE SCHEMA warehouse_abc12345;  -- short tenant ID

-- Example: tenant connects MySQL database, syncs 3 tables
-- Pipeline creates:
CREATE TABLE warehouse_abc12345.raw_proddb_orders (
    _id             BIGSERIAL,           -- warehouse-local PK
    _synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    _source_id      TEXT NOT NULL,        -- original PK from source
    -- ... all source columns mapped dynamically ...
    customer_id     BIGINT,
    total           DECIMAL(12,2),
    status          VARCHAR(50),
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ
);

CREATE TABLE warehouse_abc12345.raw_proddb_customers (
    _id             BIGSERIAL,
    _synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    _source_id      TEXT NOT NULL,
    name            VARCHAR(255),
    email           VARCHAR(255),
    region          VARCHAR(100),
    segment         VARCHAR(50),
    created_at      TIMESTAMPTZ
);

-- Indexes for common query patterns
CREATE INDEX idx_orders_created ON warehouse_abc12345.raw_proddb_orders (created_at);
CREATE INDEX idx_orders_source  ON warehouse_abc12345.raw_proddb_orders (_source_id);

-- RLS policy (defense-in-depth — schema isolation is primary)
ALTER TABLE warehouse_abc12345.raw_proddb_orders ENABLE ROW LEVEL SECURITY;
```

### Dynamic Table Creation

The pipeline creates warehouse tables dynamically based on discovered schema:

```python
# pipelines/engine/loaders/warehouse.py

class WarehouseLoader:
    def ensure_table(self, tenant_id: str, table_name: str, columns: list[Column]):
        schema = f"warehouse_{tenant_id[:8]}"
        full_table = f"{schema}.{table_name}"

        if not self.table_exists(full_table):
            col_defs = ", ".join(
                f"{col.name} {self._pg_type(col.type)}"
                for col in columns
            )
            self.execute(f"""
                CREATE TABLE {full_table} (
                    _id BIGSERIAL,
                    _synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    _source_id TEXT NOT NULL,
                    {col_defs}
                )
            """)
        else:
            # Schema evolution: add new columns
            existing = self.get_existing_columns(full_table)
            for col in columns:
                if col.name not in existing:
                    self.execute(f"""
                        ALTER TABLE {full_table}
                        ADD COLUMN {col.name} {self._pg_type(col.type)}
                    """)

    def upsert(self, tenant_id: str, table_name: str, data: pl.DataFrame):
        schema = f"warehouse_{tenant_id[:8]}"
        full_table = f"{schema}.{table_name}"

        # Bulk upsert using COPY + temp table + INSERT ON CONFLICT
        temp_table = f"_tmp_{table_name}_{uuid4().hex[:8]}"
        self.execute(f"CREATE TEMP TABLE {temp_table} (LIKE {full_table} INCLUDING ALL)")
        self.copy_from_dataframe(temp_table, data)
        self.execute(f"""
            INSERT INTO {full_table}
            SELECT * FROM {temp_table}
            ON CONFLICT (_source_id) DO UPDATE SET
                {', '.join(f'{col} = EXCLUDED.{col}' for col in data.columns)},
                _synced_at = now()
        """)
        self.execute(f"DROP TABLE {temp_table}")
```

---

## Pre-Computed Aggregations

For dashboard performance, the platform auto-generates materialized views
based on the semantic model:

```python
# When a semantic model is published, generate aggregations

def create_aggregations(tenant_id: str, model: SemanticModel):
    schema = f"warehouse_{tenant_id[:8]}"

    for time_dim in model.temporal_dimensions:
        for granularity in ['day', 'week', 'month']:
            view_name = f"agg_{model.slug}_{time_dim.slug}_{granularity}"

            metrics_sql = ", ".join(
                f"{m.aggregation}({m.table_alias}.{m.column_name}) AS {m.slug}"
                for m in model.metrics
            )
            dims_sql = ", ".join(
                f"{d.table_alias}.{d.column_name} AS {d.slug}"
                for d in model.categorical_dimensions
            )

            sql = f"""
                CREATE MATERIALIZED VIEW {schema}.{view_name} AS
                SELECT
                    DATE_TRUNC('{granularity}', {time_dim.table_alias}.{time_dim.column_name}) AS period,
                    {dims_sql},
                    {metrics_sql}
                FROM {model.primary_table_full_name}
                {model.joins_sql}
                GROUP BY 1, {dims_sql}
                WITH DATA
            """
            execute(sql)

            # Create unique index for REFRESH CONCURRENTLY
            execute(f"""
                CREATE UNIQUE INDEX ON {schema}.{view_name} (period, {dims_sql})
            """)
```

### Refresh Strategy

```
Pipeline completes sync for tenant
  └→ Publishes "SyncCompleted" event to NATS
      └→ Query Engine receives event
          └→ REFRESH MATERIALIZED VIEW CONCURRENTLY for affected tenant
          └→ Invalidate Redis cache for affected tenant
```

---

## Pipeline Scheduling

Each connector instance has its own schedule. The Dagster orchestrator
dynamically schedules runs:

```python
# pipelines/dagster_project/sensors.py

@sensor(minimum_interval_seconds=60)
def sync_scheduler(context, platform_db: PlatformDBResource):
    """Check for connector instances that are due for sync."""
    due_connectors = platform_db.get_due_connectors()

    for connector in due_connectors:
        yield RunRequest(
            run_key=f"{connector.id}_{datetime.utcnow().isoformat()}",
            run_config={
                "resources": {
                    "tenant_config": {"config": {"tenant_id": connector.tenant_id}},
                    "connector_config": {"config": {"connector_id": connector.id}},
                },
            },
            tags={
                "tenant_id": connector.tenant_id,
                "connector_id": connector.id,
                "connector_type": connector.type_id,
            },
        )

    # Update next_sync_at for processed connectors
    platform_db.update_next_sync_times(due_connectors)
```

### Pipeline Monitoring API

The NestJS Connector Service exposes pipeline status to the dashboard:

```typescript
// apps/connector-service/src/sync/sync.controller.ts

@Get(':connectorId/sync-history')
async getSyncHistory(
  @TenantId() tenantId: string,
  @Param('connectorId') connectorId: string,
  @Query('limit') limit = 20,
) {
  return this.syncService.getRunHistory(tenantId, connectorId, limit);
}

// Returns:
// [
//   { id: "...", startedAt: "...", completedAt: "...", status: "completed",
//     rowsSynced: 1234, tablesSynced: 5, durationMs: 3200 },
//   { id: "...", startedAt: "...", status: "failed",
//     errorMessage: "Connection refused", durationMs: 1500 },
// ]
```

---

## Data Retention

Per plan, data is retained for a configurable period:

| Plan | Retention |
|------|-----------|
| Free | 30 days |
| Starter | 1 year |
| Pro | 3 years |
| Business | 5 years |
| Enterprise | Custom |

```sql
-- Automated retention cleanup (runs daily via Dagster sensor)
DELETE FROM warehouse_abc12345.raw_proddb_orders
WHERE _synced_at < now() - INTERVAL '30 days'
AND (SELECT plan FROM tenants WHERE id = 'abc12345') = 'free';
```

---

## Webhook Ingestion

For real-time data sources, the platform provides a webhook endpoint per
connector instance:

```
POST /api/webhooks/ingest/{connector_instance_id}
Headers:
  X-Webhook-Secret: {configured_secret}
Body:
  { ... event payload ... }
```

The webhook handler:
1. Validates the secret
2. Stores the raw event in a `webhook_events` table
3. Publishes to NATS for async processing
4. Dagster sensor picks up events and materializes into warehouse tables

```sql
CREATE TABLE webhook_events (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_instance_id UUID NOT NULL REFERENCES connector_instances(id),
    tenant_id             UUID NOT NULL,
    event_type            VARCHAR(255),
    payload               JSONB NOT NULL,
    processed             BOOLEAN DEFAULT false,
    received_at           TIMESTAMPTZ DEFAULT now(),
    processed_at          TIMESTAMPTZ
);
```
