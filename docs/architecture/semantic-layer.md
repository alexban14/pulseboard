# Semantic Layer

The semantic layer is the core differentiator of Pulseboard. It sits between raw
database tables and dashboard widgets, allowing non-technical users to define what
their data means — without writing SQL.

## The Problem

Without a semantic layer, every dashboard widget needs hand-written SQL:

```sql
-- "Show me monthly revenue by region"
SELECT
  c.region,
  DATE_TRUNC('month', o.created_at) AS month,
  SUM(o.total) AS revenue
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE c.status = 'active'
GROUP BY 1, 2
ORDER BY revenue DESC
```

This requires SQL knowledge, knowledge of the schema (table names, column names,
join conditions), and is error-prone. Every widget duplicates this knowledge.

## The Solution

A semantic model encodes this knowledge once:

```
Model: "Sales Analytics"

Tables:     orders, customers, products
Joins:      orders.customer_id → customers.id
            orders.product_id → products.id

Metrics:    revenue = SUM(orders.total)          format: €currency
            order_count = COUNT(orders.id)       format: number
            avg_order = AVG(orders.total)        format: €currency

Dimensions: region = customers.region            type: categorical
            order_date = orders.created_at       type: temporal
            product_category = products.category type: categorical

Filters:    "Active Customers" = customers.status = 'active'
```

Now users create widgets by picking from a menu:
- **Metrics**: revenue, order_count
- **Dimensions**: region, order_date (by month)
- **Filters**: Active Customers

The query engine translates this into SQL automatically.

## Building Blocks

### 1. Model Tables

References to synced warehouse tables that this model uses. Each table has:
- A source reference (which connector, which table)
- An alias (human-readable name used in the model UI)

```
model_tables:
  ┌────────┬─────────────┬──────────────────────────────────────┐
  │ alias  │ source_table │ warehouse_table                     │
  ├────────┼─────────────┼──────────────────────────────────────┤
  │ orders │ orders      │ warehouse_abc.raw_proddb_orders      │
  │ customers │ customers│ warehouse_abc.raw_proddb_customers   │
  │ products │ products  │ warehouse_abc.raw_proddb_products    │
  └────────┴─────────────┴──────────────────────────────────────┘
```

### 2. Joins

How tables relate. Defined once, applied automatically when a query uses columns
from multiple tables.

```
model_joins:
  ┌─────────────┬──────────────┬───────────┬─────────────┬──────────────┐
  │ left_table  │ left_column  │ join_type │ right_table │ right_column │
  ├─────────────┼──────────────┼───────────┼─────────────┼──────────────┤
  │ orders      │ customer_id  │ LEFT      │ customers   │ id           │
  │ orders      │ product_id   │ LEFT      │ products    │ id           │
  └─────────────┴──────────────┴───────────┴─────────────┴──────────────┘
```

The query engine uses these to determine which JOINs to include. If a query only
uses columns from `orders`, no joins are generated. If it uses `orders.total` and
`customers.region`, the engine adds the `orders → customers` join.

### 3. Metrics (Measures)

Aggregated numeric values. Each metric has:
- **column** + **aggregation**: e.g., `SUM(orders.total)`
- **or expression**: for calculated metrics, e.g., `SUM(orders.total) - SUM(orders.cost)`
- **format**: how to display (number, currency, percentage, duration)
- **format_options**: locale, decimals, prefix/suffix

Supported aggregations: `SUM`, `COUNT`, `AVG`, `MIN`, `MAX`, `COUNT_DISTINCT`

### 4. Dimensions (Group-By Fields)

Columns used to slice and filter data. Three types:

**Categorical** — string/enum columns for grouping:
```
region, product_category, status, country, department
```

**Temporal** — date/timestamp columns with granularity:
```
order_date (granularity: day | week | month | quarter | year)
```
The query engine wraps these in `DATE_TRUNC()` based on the selected granularity.

**Numeric Bin** (future) — numeric columns bucketed into ranges:
```
order_total → $0-50, $50-100, $100-500, $500+
```

### 5. Calculated Fields

Virtual columns derived from expressions:
```
order_year     = EXTRACT(YEAR FROM orders.created_at)
is_high_value  = CASE WHEN orders.total > 500 THEN 'High' ELSE 'Standard' END
margin         = orders.total - orders.cost
```

These can be used as dimensions or in metric expressions.

### 6. Named Filters

Reusable WHERE conditions that users can toggle in the query builder or dashboard:
```
"Active Customers"     → customers.status = 'active'
"This Year"            → orders.created_at >= '2026-01-01'
"High Value Orders"    → orders.total > 500
```

## Query Translation

When a widget or query builder submits a request, the query engine:

### Step 1: Receive a QueryDefinition

```json
{
  "modelId": "01KP...",
  "metrics": [
    { "metricId": "01KP...(revenue)" },
    { "metricId": "01KP...(order_count)" }
  ],
  "dimensions": [
    { "dimensionId": "01KP...(region)" },
    { "dimensionId": "01KP...(order_date)", "granularity": "month" }
  ],
  "filters": [
    { "field": "order_date", "operator": "between", "value": ["2025-01-01", "2025-12-31"] }
  ],
  "namedFilters": ["01KP...(Active Customers)"],
  "sort": [{ "field": "revenue", "direction": "desc" }],
  "limit": 100
}
```

### Step 2: Resolve the model

Load the semantic model and look up each referenced metric, dimension, and filter.
Determine which tables are needed and which joins to include.

### Step 3: Build the SELECT clause

```sql
SELECT
  customers.region AS region,
  DATE_TRUNC('month', orders.created_at) AS order_date,
  SUM(orders.total) AS revenue,
  COUNT(orders.id) AS order_count
```

### Step 4: Build FROM + JOINs

Only include joins for tables actually referenced in this query.

```sql
FROM warehouse_abc.raw_proddb_orders orders
LEFT JOIN warehouse_abc.raw_proddb_customers customers
  ON orders.customer_id = customers.id
```

(`products` join is NOT included because no product columns are used.)

### Step 5: Build WHERE

Combine explicit filters + named filters. Always inject tenant scope.

```sql
WHERE orders.created_at BETWEEN $1 AND $2
  AND customers.status = 'active'
```

### Step 6: GROUP BY + ORDER BY + LIMIT

```sql
GROUP BY customers.region, DATE_TRUNC('month', orders.created_at)
ORDER BY revenue DESC
LIMIT 100
```

### Step 7: Execute and return

Run the parameterized query against PostgreSQL, measure duration, check cache,
return typed results.

## Database Schema

```
semantic_models
  │
  ├── model_tables          (which warehouse tables)
  │
  ├── model_joins           (table relationships)
  │
  ├── model_metrics         (aggregated measures)
  │
  ├── model_dimensions      (group-by columns)
  │
  ├── model_calculated_fields  (virtual expressions)
  │
  └── model_named_filters   (reusable conditions)
```

The `semantic_models` table exists in the current schema. The child tables
(`model_tables`, `model_joins`, `model_metrics`, `model_dimensions`,
`model_calculated_fields`, `model_named_filters`) will be added in Phase 2.

See [database-schema.md](database-schema.md) for the full Drizzle schema.

## Model Lifecycle

```
Draft  ──────►  Published  ──────►  Archived
  │                │                    │
  │  Editable      │  Used by           │  Read-only
  │  Not queryable │  dashboards        │  Not queryable
  │                │  Versioned         │  Preserved for history
```

- **Draft**: being built, can be changed freely, not available for queries.
- **Published**: active, used by dashboards. Changes create a new version.
- **Archived**: deprecated, dashboards still reference it but it's marked for migration.

## Why Not Just Use SQL?

We support raw SQL mode too (Pro+ plans). But the semantic layer adds:

1. **Consistency** — "revenue" means the same thing in every dashboard.
2. **Governance** — admins define what metrics exist and how they're calculated.
3. **Accessibility** — non-technical users can explore data.
4. **Performance** — the engine can optimize queries, use pre-aggregations, and cache results.
5. **Safety** — users can't run arbitrary queries against the warehouse; the model constrains what's queryable.
