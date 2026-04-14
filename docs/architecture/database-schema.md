# Database Schema

All tables are defined in `packages/shared-db/src/schema/` using Drizzle ORM.
The schema uses PostgreSQL 16 with TimescaleDB extension.

## ID Strategy: ULIDs

All primary keys use **ULIDs** (Universally Unique Lexicographically Sortable
Identifiers) stored as `varchar(26)`.

**Why ULID over UUID v4:**

| Property | UUID v4 | ULID |
|----------|---------|------|
| Sortable | No (random) | Yes (time-ordered) |
| B-tree index perf | Poor (random inserts) | Excellent (sequential) |
| Timestamp embedded | No | Yes (first 48 bits) |
| Format | `550e8400-e29b-41d4-...` (36 chars) | `01ARZ3NDEKTSV4RR...` (26 chars) |
| Storage | 16 bytes | 16 bytes (binary-equivalent) |

ULIDs are generated at the application level via the `ulidx` package:

```typescript
// packages/shared-db/src/ulid.ts
import { ulid } from 'ulidx';
export function newId(): string {
  return ulid();
}
```

Used in table definitions as:
```typescript
id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId)
```

## Table Map

### Platform Tables (shared schema)

These tables use row-level isolation via `tenant_id` columns.

```
tenants
  └─── tenant_users
  └─── connector_instances
  │      └─── connector_sync_tables
  │      └─── connector_sync_runs
  └─── semantic_models
  └─── dashboards
         └─── widgets
```

### Warehouse Tables (per-tenant schema)

Created dynamically when connectors sync data. Each tenant gets a PostgreSQL
schema: `warehouse_{tenant_id_prefix}`.

```
warehouse_abc12345/
  ├── raw_proddb_orders
  ├── raw_proddb_customers
  ├── raw_proddb_products
  └── raw_stripe_charges
```

These tables are NOT defined in Drizzle — they're created at runtime by the
ETL pipeline based on discovered schemas.

## Table Definitions

### `tenants`

The root entity. Every other platform table references a tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(26) PK | ULID |
| `name` | varchar(255) | Display name |
| `slug` | varchar(100) UNIQUE | URL-safe identifier |
| `plan` | varchar(50) | free, starter, pro, business, enterprise |
| `status` | varchar(50) | active, suspended, cancelled |
| `settings` | jsonb | Tenant-specific settings |
| `branding` | jsonb | Logo, colors, favicon (white-label) |
| `custom_domain` | varchar(255) | e.g., analytics.acme.com |
| `auth_config` | jsonb | OIDC provider config (clientId, issuer, etc.) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | Soft delete |

Indexes: `slug`, `status`

### `tenant_users`

Users within a tenant. A user belongs to exactly one tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(26) PK | ULID |
| `tenant_id` | varchar(26) FK | References tenants |
| `email` | varchar(255) | |
| `name` | varchar(255) | |
| `role` | varchar(50) | admin, editor, explorer, viewer |
| `auth_provider` | varchar(50) | local, azure_ad, google |
| `external_id` | varchar(255) | SSO subject ID |
| `password_hash` | varchar(255) | bcrypt hash (local auth only) |
| `last_login_at` | timestamptz | |
| `created_at` | timestamptz | |

Unique: `(tenant_id, email)`
Indexes: `tenant_id`, `email`

### `connector_instances`

A configured data source connection for a tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(26) PK | ULID |
| `tenant_id` | varchar(26) FK | References tenants |
| `connector_type_id` | varchar(100) | mysql, postgresql, rest-api, csv, etc. |
| `name` | varchar(255) | User-given name: "Production DB" |
| `config` | text | Encrypted connection config (AES-256-GCM) |
| `status` | varchar(50) | pending, healthy, degraded, error |
| `last_tested_at` | timestamptz | |
| `last_test_error` | text | |
| `sync_schedule` | varchar(100) | Cron expression |
| `sync_mode` | varchar(50) | incremental, full_refresh |
| `last_sync_at` | timestamptz | |
| `last_sync_rows` | integer | |
| `last_sync_duration_ms` | integer | |
| `next_sync_at` | timestamptz | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique: `(tenant_id, name)`
Indexes: `tenant_id`, `status`, `next_sync_at`

### `connector_sync_tables`

Which source tables are selected for sync within a connector.

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(26) PK | ULID |
| `connector_instance_id` | varchar(26) FK | |
| `source_table` | varchar(255) | Table name in the source database |
| `warehouse_table` | varchar(255) | Table name in the warehouse schema |
| `sync_enabled` | boolean | Can be toggled off without deleting |
| `incremental_column` | varchar(255) | Column for incremental sync (e.g., updated_at) |
| `last_sync_value` | text | Last seen value of the incremental column |

Unique: `(connector_instance_id, source_table)`

### `connector_sync_runs`

Audit log of every sync execution.

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(26) PK | ULID |
| `connector_instance_id` | varchar(26) FK | |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | |
| `status` | varchar(50) | running, completed, failed, cancelled |
| `rows_synced` | integer | |
| `tables_synced` | integer | |
| `error_message` | text | |
| `duration_ms` | integer | |

Indexes: `connector_instance_id`, `status`, `started_at`

### `semantic_models`

A tenant-defined data model (metrics, dimensions, joins).

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(26) PK | ULID |
| `tenant_id` | varchar(26) FK | |
| `name` | varchar(255) | |
| `description` | text | |
| `version` | integer | Incremented on publish |
| `status` | varchar(50) | draft, published, archived |
| `created_by` | varchar(26) FK | References tenant_users |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique: `(tenant_id, name)`
Indexes: `tenant_id`, `status`

**Child tables** (added in Phase 2): `model_tables`, `model_joins`,
`model_metrics`, `model_dimensions`, `model_calculated_fields`,
`model_named_filters`. See [semantic-layer.md](semantic-layer.md).

### `dashboards`

A dashboard owned by a tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(26) PK | ULID |
| `tenant_id` | varchar(26) FK | |
| `name` | varchar(255) | |
| `description` | text | |
| `is_default` | boolean | Shown on login |
| `created_by` | varchar(26) FK | References tenant_users |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes: `tenant_id`, `created_by`

### `widgets`

A chart/table/KPI card within a dashboard.

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(26) PK | ULID |
| `dashboard_id` | varchar(26) FK | |
| `type` | varchar(50) | kpi_card, line_chart, bar_chart, etc. |
| `title` | varchar(255) | |
| `position` | jsonb | `{ x, y, w, h }` grid coordinates |
| `query` | jsonb | QueryDefinition (model, metrics, dims, filters) |
| `display` | jsonb | Colors, legend, number format, etc. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes: `dashboard_id`

## Relations (Drizzle)

Every table has `relations()` defined for Drizzle's relational query API:

```typescript
// Example: tenant has many users, connectors, dashboards, models
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(tenantUsers),
  connectorInstances: many(connectorInstances),
  dashboards: many(dashboards),
  semanticModels: many(semanticModels),
}));
```

This enables queries like:
```typescript
const tenant = await db.query.tenants.findFirst({
  where: eq(tenants.id, tenantId),
  with: {
    users: true,
    connectorInstances: { with: { syncRuns: true } },
  },
});
```
