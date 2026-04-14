# 02 — Requirements

## Functional Requirements

### FR-1: Connector Framework

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | Pluggable connector architecture — new connectors can be added without modifying core platform | P0 |
| FR-1.2 | Built-in database connectors: MySQL, PostgreSQL, MariaDB, SQL Server, MongoDB | P0 |
| FR-1.3 | Built-in SaaS connectors: Stripe, HubSpot (expand over time) | P1 |
| FR-1.4 | Generic REST API connector with visual request/response mapping | P0 |
| FR-1.5 | Generic GraphQL connector | P2 |
| FR-1.6 | File upload connector: CSV, Excel, Google Sheets | P0 |
| FR-1.7 | Webhook receiver: accept inbound events from any service | P1 |
| FR-1.8 | Connector SDK for third-party developers to build custom connectors | P2 |
| FR-1.9 | Connector health monitoring: test connection, last sync status, error logs | P0 |
| FR-1.10 | OAuth2 and API key authentication support per connector | P0 |

### FR-2: Schema Discovery & Introspection

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | Auto-discover tables/collections and columns/fields from database connectors | P0 |
| FR-2.2 | Detect column types (string, number, date, boolean, JSON) | P0 |
| FR-2.3 | Detect foreign key relationships between tables | P0 |
| FR-2.4 | Infer relationships from naming conventions (e.g., `user_id` → `users.id`) | P1 |
| FR-2.5 | Sample data preview (first N rows) per table | P0 |
| FR-2.6 | Schema change detection — alert when source schema changes | P1 |
| FR-2.7 | For REST API connectors: parse JSON response and map to tabular schema | P0 |
| FR-2.8 | Selective sync — tenant chooses which tables/endpoints to ingest | P0 |

### FR-3: Semantic Layer (Data Modeling)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | Visual model builder — drag tables, define joins, create calculated fields | P0 |
| FR-3.2 | Define **metrics** (measures): aggregations on columns (SUM, COUNT, AVG, MIN, MAX, COUNT DISTINCT) | P0 |
| FR-3.3 | Define **dimensions**: columns used for grouping and filtering | P0 |
| FR-3.4 | Define **calculated fields**: expressions combining columns (e.g., `revenue - cost`) | P0 |
| FR-3.5 | Define **time dimensions** with granularity (day, week, month, quarter, year) | P0 |
| FR-3.6 | Define **relationships** between tables (1:1, 1:N, N:M) with join conditions | P0 |
| FR-3.7 | Define **filters** as reusable named conditions (e.g., "Active Users" = `status = 'active'`) | P1 |
| FR-3.8 | Model versioning — track changes, rollback to previous versions | P2 |
| FR-3.9 | Model sharing — share models across dashboards within a tenant | P0 |
| FR-3.10 | AI-assisted modeling — suggest metrics and dimensions from schema analysis | P2 |
| FR-3.11 | Multiple models per tenant — one per business domain (sales, support, finance) | P0 |

### FR-4: ETL / Data Pipeline

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | Scheduled data sync with configurable frequency (5m, 15m, 1h, daily) per connector | P0 |
| FR-4.2 | Incremental sync (timestamp-based or CDC) to avoid full table scans | P0 |
| FR-4.3 | Full refresh option (re-sync all data) | P0 |
| FR-4.4 | Data transformation layer: rename columns, cast types, filter rows, add calculated columns | P1 |
| FR-4.5 | Pre-computed aggregations / materialized views for dashboard performance | P0 |
| FR-4.6 | Pipeline monitoring: run history, duration, rows synced, errors | P0 |
| FR-4.7 | Manual trigger: force sync now | P0 |
| FR-4.8 | Backfill: re-sync historical data from a given date | P1 |
| FR-4.9 | Data retention policies per tenant/plan | P1 |

### FR-5: Query Engine

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-5.1 | Translate semantic model queries (metrics + dimensions + filters) into SQL | P0 |
| FR-5.2 | Visual query builder UI: select metrics, dimensions, filters, sort, limit | P0 |
| FR-5.3 | Query caching with configurable TTL | P0 |
| FR-5.4 | Save, name, and share queries within the tenant | P0 |
| FR-5.5 | Parameterized queries (date ranges, entity filters) | P0 |
| FR-5.6 | Raw SQL mode for advanced users (opt-in per tenant, read-only) | P1 |
| FR-5.7 | Query result export: Excel, CSV, PDF | P0 |
| FR-5.8 | Query execution limits per plan (timeout, row count) | P0 |

### FR-6: Dashboard & Visualization

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-6.1 | Drag-and-drop dashboard builder with responsive grid layout | P0 |
| FR-6.2 | Widget types: line, bar, area, pie, donut, table, KPI card, funnel, heatmap, gauge, scatter | P0 |
| FR-6.3 | Global dashboard filters (date range, dimension filters) propagate to all widgets | P0 |
| FR-6.4 | Widget-level drill-down (click a segment → filter the dashboard) | P1 |
| FR-6.5 | Dashboard templates — pre-built layouts for common use cases | P1 |
| FR-6.6 | Dashboard sharing: link, role-based, public (view-only) | P0 |
| FR-6.7 | Full-screen / presentation / TV mode | P2 |
| FR-6.8 | Auto-refresh with configurable interval | P1 |
| FR-6.9 | Dashboard export: PDF, PNG screenshot | P2 |
| FR-6.10 | Embeddable dashboards via iframe with tenant-scoped tokens | P1 |

### FR-7: Alerting & Automation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-7.1 | Threshold alerts on any metric (e.g., "daily revenue < €1000") | P1 |
| FR-7.2 | Alert channels: in-app notification, email, webhook | P1 |
| FR-7.3 | Scheduled reports: cron-based query execution → email delivery | P1 |
| FR-7.4 | Alert cooldown / suppression window | P2 |

### FR-8: Tenant Administration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-8.1 | Self-service tenant signup and onboarding wizard | P0 |
| FR-8.2 | Tenant settings: name, logo, custom domain, auth provider | P0 |
| FR-8.3 | User management: invite, roles (Admin, Editor, Viewer), deactivate | P0 |
| FR-8.4 | Data source management: add, configure, test, schedule, monitor | P0 |
| FR-8.5 | Usage dashboard: storage, queries, users vs plan limits | P1 |
| FR-8.6 | Billing management: plan selection, payment method, invoices | P1 |
| FR-8.7 | White-label settings: logo, colors, favicon (Business+ plans) | P2 |

### FR-9: Platform Administration (Super-Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-9.1 | Tenant overview: list, status, usage, plan | P0 |
| FR-9.2 | Connector registry: manage available connector types | P0 |
| FR-9.3 | Platform metrics: total tenants, queries/day, storage, pipeline health | P1 |
| FR-9.4 | Tenant impersonation for support purposes | P1 |

---

## Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Dashboard page load (P95) | < 2 seconds |
| NFR-2 | Query execution — cached/pre-aggregated (P95) | < 500 ms |
| NFR-3 | Query execution — ad-hoc over 1M rows (P95) | < 10 seconds |
| NFR-4 | ETL pipeline lag (scheduled connectors) | Configurable, min 5 min |
| NFR-5 | Concurrent dashboard viewers per tenant | >= 50 |
| NFR-6 | Total concurrent tenants | >= 100 |
| NFR-7 | Availability | 99.5% uptime |
| NFR-8 | Horizontal scalability | Add workers without downtime |
| NFR-9 | Tenant data isolation | Zero cross-tenant leakage |
| NFR-10 | Schema discovery time (1000-table database) | < 30 seconds |
| NFR-11 | Onboarding time (connect → first dashboard) | < 30 minutes |
| NFR-12 | API response format | JSON, consistent envelope |
| NFR-13 | GDPR compliance | Data residency options, deletion API, consent tracking |
