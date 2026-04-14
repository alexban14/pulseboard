# 05 — Semantic Layer

The semantic layer is the **core differentiator** of this platform. It sits between
raw data and dashboards, allowing non-technical users to define what their data
means — without writing SQL.

## What Is a Semantic Layer?

```
┌─────────────────────────────────┐
│         Dashboard / Widget       │
│    "Show monthly revenue by     │
│     region for last 12 months"  │
└───────────────┬─────────────────┘
                │ uses metrics & dimensions
┌───────────────▼─────────────────┐
│         SEMANTIC MODEL           │
│                                  │
│  Metrics:                        │
│    revenue = SUM(orders.total)   │
│    order_count = COUNT(orders.id)│
│    avg_order = AVG(orders.total) │
│                                  │
│  Dimensions:                     │
│    region = customers.region     │
│    order_date = orders.created   │
│    product_category = ...        │
│                                  │
│  Relationships:                  │
│    orders.customer_id →          │
│      customers.id                │
│                                  │
└───────────────┬─────────────────┘
                │ translates to SQL
┌───────────────▼─────────────────┐
│         RAW WAREHOUSE DATA       │
│                                  │
│  orders (id, customer_id,        │
│          total, created_at)      │
│  customers (id, name, region)    │
│                                  │
└──────────────────────────────────┘
```

Users interact with **business concepts** (revenue, region, order count) —
never with raw tables and columns.

---

## Semantic Model Schema

### Database Tables

```sql
-- Semantic models (one or more per tenant)
CREATE TABLE semantic_models (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    version         INT NOT NULL DEFAULT 1,
    status          VARCHAR(50) DEFAULT 'draft',   -- draft, published, archived
    created_by      UUID REFERENCES tenant_users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- Tables included in the model
CREATE TABLE model_tables (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id              UUID NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    connector_instance_id UUID NOT NULL REFERENCES connector_instances(id),
    source_schema         VARCHAR(255),           -- source DB schema
    source_table          VARCHAR(255) NOT NULL,  -- actual table name
    alias                 VARCHAR(255) NOT NULL,  -- display name in the model
    description           TEXT,
    is_primary            BOOLEAN DEFAULT false,  -- the "base" table for this model
    selected_columns      JSONB,                  -- null = all, or array of column names
    UNIQUE(model_id, alias)
);

-- Joins between model tables
CREATE TABLE model_joins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        UUID NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    left_table_id   UUID NOT NULL REFERENCES model_tables(id),
    right_table_id  UUID NOT NULL REFERENCES model_tables(id),
    join_type       VARCHAR(20) NOT NULL DEFAULT 'left', -- inner, left, right, full
    left_column     VARCHAR(255) NOT NULL,
    right_column    VARCHAR(255) NOT NULL,
    description     TEXT
);

-- Metrics (measures) — aggregated values
CREATE TABLE model_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        UUID NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,         -- display name: "Revenue"
    slug            VARCHAR(255) NOT NULL,         -- url-safe: "revenue"
    description     TEXT,
    table_id        UUID REFERENCES model_tables(id),
    column_name     VARCHAR(255),                  -- source column (null if calculated)
    aggregation     VARCHAR(50) NOT NULL,          -- sum, count, avg, min, max, count_distinct
    expression      TEXT,                          -- for calculated metrics: "SUM(total) - SUM(cost)"
    format          VARCHAR(50) DEFAULT 'number',  -- number, currency, percentage, duration
    format_options  JSONB DEFAULT '{}',            -- {decimals: 2, prefix: "€", locale: "de-DE"}
    sort_order      INT DEFAULT 0,
    UNIQUE(model_id, slug)
);

-- Dimensions — columns for grouping and filtering
CREATE TABLE model_dimensions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        UUID NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    table_id        UUID REFERENCES model_tables(id),
    column_name     VARCHAR(255) NOT NULL,
    dimension_type  VARCHAR(50) DEFAULT 'categorical', -- categorical, temporal, numeric_bin
    time_granularity VARCHAR(50),                       -- day, week, month, quarter, year (temporal only)
    sort_order      INT DEFAULT 0,
    UNIQUE(model_id, slug)
);

-- Calculated fields — virtual columns from expressions
CREATE TABLE model_calculated_fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        UUID NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    expression      TEXT NOT NULL,    -- SQL expression: "EXTRACT(YEAR FROM orders.created_at)"
    result_type     VARCHAR(50) NOT NULL, -- string, number, date, boolean
    description     TEXT,
    UNIQUE(model_id, slug)
);

-- Named filters — reusable filter conditions
CREATE TABLE model_named_filters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id        UUID NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,         -- "Active Customers"
    slug            VARCHAR(255) NOT NULL,
    condition       JSONB NOT NULL,                -- {field: "status", op: "eq", value: "active"}
    description     TEXT,
    UNIQUE(model_id, slug)
);
```

---

## Schema Discovery Flow

When a tenant connects a new data source:

```
1. Tenant adds connector instance (e.g., MySQL database)
   └→ ConnectorInstanceCreated event

2. Schema Discovery Service introspects the source:
   ├→ List all schemas and tables
   ├→ For each table: list columns with types
   ├→ Detect primary keys
   ├→ Detect foreign key constraints
   └→ Estimate row counts

3. Discovery result is stored and presented to user:
   ┌──────────────────────────────────────────────┐
   │  Schema Discovery Results                     │
   │                                               │
   │  Database: migro_production                   │
   │  Tables found: 47                             │
   │                                               │
   │  ☑ orders         (124,523 rows)  12 columns │
   │  ☑ customers      (8,441 rows)    9 columns  │
   │  ☑ products       (342 rows)      7 columns  │
   │  ☐ migrations     (system table)             │
   │  ☐ sessions       (system table)             │
   │  ...                                         │
   │                                               │
   │  Relationships detected:                      │
   │    orders.customer_id → customers.id          │
   │    orders.product_id → products.id            │
   │                                               │
   │  [Select All Business Tables]  [Next →]       │
   └──────────────────────────────────────────────┘

4. User selects which tables to sync
   └→ Pipeline creates extraction jobs for selected tables

5. After initial sync, user can create a Semantic Model:
   └→ Selected tables are available as model sources
```

### Schema Introspection (Python)

```python
# pipelines/engine/discovery/introspect.py

class SchemaIntrospector:
    """Generic schema discovery for SQL databases."""

    def discover(self, connection: DatabaseConnection) -> DiscoveredSchema:
        inspector = sqlalchemy.inspect(connection.engine)

        tables = []
        for table_name in inspector.get_table_names():
            columns = []
            for col in inspector.get_columns(table_name):
                columns.append(DiscoveredColumn(
                    name=col['name'],
                    type=self._map_type(col['type']),
                    nullable=col.get('nullable', True),
                ))

            pk = inspector.get_pk_constraint(table_name)
            fks = inspector.get_foreign_keys(table_name)

            tables.append(DiscoveredTable(
                name=table_name,
                columns=columns,
                primary_key=pk.get('constrained_columns', []),
                foreign_keys=[
                    ForeignKeyRelation(
                        from_column=fk['constrained_columns'][0],
                        to_table=fk['referred_table'],
                        to_column=fk['referred_columns'][0],
                    )
                    for fk in fks
                ],
                estimated_rows=self._estimate_rows(connection, table_name),
            ))

        return DiscoveredSchema(tables=tables, discovered_at=datetime.utcnow())
```

### REST API Schema Discovery

For REST API connectors, schema is derived from response payloads:

```
1. User configures endpoint URL + auth
2. Platform makes a sample request
3. JSON response is parsed:
   - Top-level keys become "tables" (if arrays of objects)
   - Object keys become columns
   - Types inferred from values
4. User confirms/adjusts the mapping
```

---

## Visual Model Builder UI

```
┌───────────────────────────────────────────────────────────────┐
│  Semantic Model: "Sales Analytics"                    [Save]  │
│                                                               │
│  ┌─── Tables ───────────────────────────────────────────────┐ │
│  │                                                          │ │
│  │  ┌──────────┐    1:N    ┌───────────┐    N:1   ┌──────┐ │ │
│  │  │ Customers│──────────→│  Orders   │←─────────│Produc│ │ │
│  │  │          │           │           │          │      │ │ │
│  │  │ id       │           │ id        │          │ id   │ │ │
│  │  │ name     │           │ customer_ │          │ name │ │ │
│  │  │ region   │           │ product_id│          │ price│ │ │
│  │  │ segment  │           │ total     │          │ cat  │ │ │
│  │  │ created  │           │ created_at│          │      │ │ │
│  │  └──────────┘           └───────────┘          └──────┘ │ │
│  │                                                          │ │
│  │  [+ Add Table]                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─── Metrics ──────────────────┐  ┌─── Dimensions ────────┐ │
│  │                              │  │                        │ │
│  │  📊 Revenue                  │  │  📁 Region             │ │
│  │     SUM(orders.total)        │  │     customers.region   │ │
│  │     Format: € currency       │  │                        │ │
│  │                              │  │  📁 Product Category   │ │
│  │  📊 Order Count              │  │     products.category  │ │
│  │     COUNT(orders.id)         │  │                        │ │
│  │                              │  │  📅 Order Date         │ │
│  │  📊 Avg Order Value          │  │     orders.created_at  │ │
│  │     AVG(orders.total)        │  │     Granularity: month │ │
│  │                              │  │                        │ │
│  │  [+ Add Metric]              │  │  [+ Add Dimension]     │ │
│  └──────────────────────────────┘  └────────────────────────┘ │
│                                                               │
│  ┌─── Named Filters ───────────────────────────────────────┐ │
│  │  🔍 "Active Customers"  →  customers.status = 'active'  │ │
│  │  🔍 "This Year"         →  orders.created >= 2026-01-01 │ │
│  │  [+ Add Filter]                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## Query Translation

When a dashboard widget requests data:

```
Widget Config:
  model: "Sales Analytics"
  metrics: [revenue, order_count]
  dimensions: [region, order_date(month)]
  filters: [named:"Active Customers", order_date between 2025-01-01 and 2025-12-31]
  sort: revenue DESC
  limit: 100

        ↓ Query Engine translates via Semantic Model ↓

Generated SQL:
  SELECT
    c.region                                    AS region,
    DATE_TRUNC('month', o.created_at)          AS order_date,
    SUM(o.total)                                AS revenue,
    COUNT(o.id)                                 AS order_count
  FROM warehouse_{tenant}.raw_orders o
  INNER JOIN warehouse_{tenant}.raw_customers c
    ON o.customer_id = c.id
  WHERE c.status = 'active'                    -- named filter
    AND o.created_at BETWEEN $1 AND $2         -- widget filter
  GROUP BY c.region, DATE_TRUNC('month', o.created_at)
  ORDER BY revenue DESC
  LIMIT 100
```

The user never sees or writes this SQL. They just pick metrics and dimensions.

---

## AI-Assisted Modeling

When a tenant completes schema discovery, the platform uses the **shared LLM provider framework** (see [04-ARCHITECTURE.md](04-ARCHITECTURE.md) and [14-NATURAL-LANGUAGE-QUERIES.md](14-NATURAL-LANGUAGE-QUERIES.md)) to suggest model elements.

The same LLM provider interface used by NLQ powers these features — tenants who configure a custom provider (Groq, Ollama, etc.) for NLQ automatically get AI-assisted modeling through the same provider.

### Auto-Suggest Features

1. **Auto-detect metrics**: Numeric columns with names like `amount`, `total`, `price`, `cost`, `revenue` → suggest SUM aggregations.

2. **Auto-detect dimensions**: String columns with names like `status`, `type`, `category`, `region`, `country` → suggest categorical dimensions.

3. **Auto-detect time dimensions**: Date/datetime columns → suggest temporal dimensions with appropriate granularity.

4. **Auto-detect relationships**: Beyond FK constraints, use naming conventions (`user_id` → `users.id`) and LLM analysis of column names and sample data.

5. **Natural language model building**: "Create a model for tracking sales performance" → LLM analyzes available tables and suggests a complete model with metrics, dimensions, and joins.

6. **Metric description generation**: Given a metric definition like `SUM(orders.total)`, generate a human-readable description: "Total revenue from all orders".

### How It Uses the LLM Provider

```
Schema discovery result + table sample data
    │
    ▼
LLM Provider (same interface as NLQ)
    │ Prompt: "Given these tables and columns, suggest metrics and dimensions"
    ▼
Suggested model elements (validated against schema)
    │
    ▼
Presented to user in the model builder UI for review/approval
```

The LLM provider is resolved from tenant config — if the tenant uses Groq for NLQ, the same Groq provider is used here. If they use a self-hosted Ollama, model suggestions also go through Ollama.

### Natural Language Queries

Users can bypass the visual query builder entirely by typing natural language questions. The NLQ service translates these into `QueryDefinition` objects using the same semantic model as context.

See [14-NATURAL-LANGUAGE-QUERIES.md](14-NATURAL-LANGUAGE-QUERIES.md) for the comprehensive NLQ plan.

This is a **progressive enhancement** — the core platform works without AI. All AI-assisted features are optional and gated by plan (Pro+).

---

## Model Versioning

Models are versioned to prevent breaking changes:

```
v1 (published) ──→ dashboards reference v1
                     │
v2 (draft)     ──→ builder edits v2
                     │
v2 (published) ──→ dashboards auto-migrate to v2
                     existing widgets validate against new schema
                     broken references flagged in UI
```

When a model is published, the system:
1. Validates all widgets referencing the model
2. Flags widgets that reference removed metrics/dimensions
3. Auto-maps renamed fields (if rename metadata is provided)
4. Notifies editors of breaking changes
