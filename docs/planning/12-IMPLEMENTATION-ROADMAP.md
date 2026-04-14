# 12 — Implementation Roadmap

## Phase Overview

```
Phase 1          Phase 2            Phase 3            Phase 4           Phase 5
Platform Core    Dashboard +        Multi-Tenant       MigroNet          Growth
                 Semantic Layer     + Auth + NLQ        Validation

(6 weeks)        (8 weeks)          (8 weeks)          (4 weeks)         (ongoing)
────────────────┼──────────────────┼──────────────────┼─────────────────┼──────────
    ▲                  ▲                 ▲                 ▲                ▲
    │                  │                 │                 │                │
 Monorepo,          Dashboard UI,     Signup,           Onboard          Billing,
 connectors,        semantic layer,   OIDC auth,        MigroNet as      marketplace,
 schema discovery,  query builder,    plans, tenant     tenant #1,       embedded,
 ETL engine,        widgets,          admin, NLQ,       validate with    AI features
 basic pipeline     exports, alerts   branding          real data
```

---

## Phase 1: Platform Core (Weeks 1–6)

**Goal**: Data can flow from any MySQL/PG database into the warehouse, with
schema discovery and pipeline monitoring working end-to-end.

### Tasks

| # | Task | Deliverable |
|---|------|-------------|
| 1.1 | Initialize Turborepo monorepo with Bun workspace | Repo structure, build pipeline |
| 1.2 | Scaffold NestJS apps: api-gateway, connector-service, tenant-service | Running services with health checks |
| 1.3 | Set up shared packages: shared-types, shared-db, shared-auth, shared-events | Cross-service imports working |
| 1.4 | Drizzle ORM + PostgreSQL: platform schema (tenants, users, connectors, sync_tables, sync_runs) | Migrations running |
| 1.5 | Tenant service: create tenant, create user (local auth only), JWT issuance | Login → JWT → authenticated requests |
| 1.6 | Connector type registry: MySQL, PostgreSQL built-in | Type definitions with config schemas |
| 1.7 | Connector instance CRUD: add, configure, test connection | API + basic UI for managing connections |
| 1.8 | Schema discovery: database introspection (tables, columns, types, FKs) | Discovery results stored and API-accessible |
| 1.9 | Table selection UI: pick which tables to sync | User selects tables, saves config |
| 1.10 | Dagster project scaffold with dynamic asset generation | Pipeline runs per tenant/connector |
| 1.11 | Database connector (Python): full + incremental extraction | Data lands in tenant warehouse schema |
| 1.12 | Warehouse loader: dynamic table creation, upsert, schema evolution | Tables auto-created from discovered schema |
| 1.13 | Sync scheduling: configurable cron per connector instance | Automated recurring syncs |
| 1.14 | Pipeline monitoring API: run history, status, errors | Visible in connector detail page |
| 1.15 | Docker Compose for full local development stack | `docker compose up` runs everything |
| 1.16 | GitHub Actions CI: lint + test + build | Green CI on every push |
| 1.17 | CSV upload connector | Upload CSV/Excel as a data source |
| 1.18 | React app scaffold (Vite + shadcn/ui + Tailwind) | Basic shell with routing |
| 1.19 | Connector management UI pages | Add/edit/test/monitor connectors in the SPA |

### Testing

- Unit tests: connector logic, schema introspection, warehouse loader
- Integration tests: Dagster pipeline against test MySQL + PG databases
- E2E: create tenant → add connector → discover schema → sync data → verify warehouse
- Performance: schema discovery on a 100-table database in < 10 seconds

### Exit Criteria

- [ ] Create a tenant, connect a MySQL database, discover schema, sync tables
- [ ] Data appears in `warehouse_{tenant_id}.raw_*` tables
- [ ] Incremental sync only fetches changed rows
- [ ] Pipeline status visible in UI
- [ ] CSV upload works and creates warehouse table

---

## Phase 2: Dashboard + Semantic Layer (Weeks 7–14)

**Goal**: Users can define semantic models, build queries visually, and create
interactive dashboards with drag-and-drop widgets.

### Tasks

| # | Task | Deliverable |
|---|------|-------------|
| 2.1 | Semantic service: model CRUD API | Create/edit/publish semantic models |
| 2.2 | Visual model builder UI: add tables, define joins visually | Drag tables, draw join lines |
| 2.3 | Metric definition UI: create metrics from columns + aggregations | Metrics stored in semantic model |
| 2.4 | Dimension definition UI: categorical and temporal dimensions | Dimensions with granularity |
| 2.5 | Calculated field definition: expression builder | Simple formula editor |
| 2.6 | Named filters: reusable filter conditions | Saveable filter presets |
| 2.7 | Query Engine service: translate QueryDefinition → SQL → execute | Semantic queries return data |
| 2.8 | Query result caching (Redis) with TTL | Repeated queries serve from cache |
| 2.9 | Visual query builder UI | Select metrics, dimensions, filters → see results |
| 2.10 | Save, name, share queries | Query library per tenant |
| 2.11 | Dashboard service: dashboard + widget CRUD | API for dashboard management |
| 2.12 | Dashboard grid UI (react-grid-layout) | Drag, drop, resize widgets |
| 2.13 | Widget renderer with ECharts: KPI card, line, bar, pie, table | 5 core widget types |
| 2.14 | Widget configuration dialog | Configure data, display, filters per widget |
| 2.15 | Global dashboard filters (date range, dimension filters) | Filters propagate to all widgets |
| 2.16 | Additional widget types: area, donut, funnel, heatmap, gauge, scatter | 11 total types |
| 2.17 | Query export: Excel, CSV download | Export button on queries and widgets |
| 2.18 | Pre-computed aggregations: auto-generate materialized views | Dashboard queries hit aggregates |
| 2.19 | Aggregation refresh on sync completion | Pipeline triggers REFRESH |
| 2.20 | Dashboard sharing: link-based, role-based visibility | Share dashboards with team |
| 2.21 | Alert service: threshold rules on metrics, email notifications | Alerts fire on threshold breaches |
| 2.22 | Scheduled reports: cron-based query → email delivery | Reports arrive in inbox |

### Testing

- Unit tests: query translation (semantic → SQL), aggregation generation
- Integration tests: end-to-end query flow (widget → API → SQL → response)
- E2E: create model → define metrics → build dashboard → widgets render data
- Performance: dashboard with 8 widgets loads in < 2s (pre-aggregated)
- Security: verify queries are scoped to tenant warehouse schema

### Exit Criteria

- [ ] Users can create semantic models visually
- [ ] Visual query builder produces correct results
- [ ] Dashboards with drag-and-drop widgets render live data
- [ ] 11 chart types functional
- [ ] Alerts fire and send email
- [ ] Scheduled reports deliver on time
- [ ] Query caching reduces repeated query latency by > 80%

---

## Phase 3: Multi-Tenant + Auth + NLQ (Weeks 15–22)

**Goal**: Multiple tenants can sign up, configure independently, and be fully
isolated. Auth supports multiple providers.

### Tasks

| # | Task | Deliverable |
|---|------|-------------|
| 3.1 | Self-service tenant signup (email/password) | Public registration page |
| 3.2 | Onboarding wizard: connect → discover → sync → model → dashboard | Guided first-time experience |
| 3.3 | PostgreSQL RLS policies on all platform tables | Defense-in-depth isolation |
| 3.4 | Tenant resolution: subdomain, custom domain, JWT | Multi-tenant routing |
| 3.5 | OIDC auth: Azure AD, Google Workspace support | SSO for Pro+ tenants |
| 3.6 | Connector credential encryption (AES-256-GCM) | Secure credential storage |
| 3.7 | Plan definition + feature gating (limits enforcement) | Plan limits enforced |
| 3.8 | Tenant admin UI: users, roles, settings | Self-service tenant management |
| 3.9 | User invitation flow: invite by email, set role | Invite team members |
| 3.10 | Generic REST API connector | Connect to any REST endpoint |
| 3.11 | Webhook connector: receive events, store, process | Real-time data ingestion |
| 3.12 | MariaDB + SQL Server connectors | Extended database support |
| 3.13 | Dashboard templates: blank + pre-built starters | Quick-start templates |
| 3.14 | Widget drill-down: click segment → filter | Interactive exploration |
| 3.15 | Dashboard auto-refresh | Configurable refresh interval |
| 3.16 | Landing page / marketing site | Product positioning and signup funnel |

### Natural Language Queries (Mega-Feature)

| # | Task | Deliverable |
|---|------|-------------|
| 3.17 | LLM provider interface + factory + Groq implementation | Core NLQ infrastructure |
| 3.18 | NLQ service: prompt construction from semantic model | Context assembly |
| 3.19 | NLQ service: response parsing + validation + slug resolution | Validated output |
| 3.20 | Anthropic + OpenAI fallback providers | Multi-provider support |
| 3.21 | OpenRouter + Ollama + Custom endpoint providers | Full provider coverage |
| 3.22 | Provider resolution chain + failover | Resilient pipeline |
| 3.23 | Query cache (Redis, normalized exact match) | Fast repeat queries |
| 3.24 | API endpoint: POST /api/nlq/query | Working E2E |
| 3.25 | Frontend: NLQ input bar + result rendering | Type question → get chart |
| 3.26 | Conversation support (multi-turn follow-ups) | Refine results |
| 3.27 | BYOK tenant config UI | Tenant manages own keys |
| 3.28 | Usage tracking + plan quota enforcement | Metered per tenant |
| 3.29 | Suggested queries (per model) | Empty-state help |
| 3.30 | "Save as Widget" + "Edit in Query Builder" from NLQ | Bridge to manual tools |

### Testing

- **Tenant isolation tests**: create 2 tenants, verify zero data leakage
- **Auth tests**: login via local, Azure AD, Google for separate tenants
- **Plan limit tests**: verify free plan blocks at 1 data source, 3 users, 2 dashboards
- **Load test**: 10 tenants, 5 concurrent users each, all querying dashboards
- **Security audit**: penetration testing focused on tenant isolation

### Exit Criteria

- [ ] Multiple tenants sign up and operate independently
- [ ] Zero cross-tenant data leakage (automated test suite)
- [ ] OIDC SSO works for Azure AD and Google
- [ ] Plan limits enforced correctly
- [ ] Onboarding wizard < 15 minutes to first dashboard
- [ ] REST API connector works for arbitrary endpoints
- [ ] NLQ: type question → get chart (E2E working)
- [ ] NLQ: multi-provider failover tested (Groq → Anthropic → OpenAI)
- [ ] NLQ: BYOK tenant config UI functional
- [ ] NLQ: usage tracking and plan quota enforcement active

---

## Phase 4: MigroNet Validation (Weeks 23–26)

**Goal**: Onboard MigroNet as tenant #1 using only generic platform features.
No custom code — if something needs custom code, the platform needs a feature.

### Tasks

| # | Task | Deliverable |
|---|------|-------------|
| 4.1 | Create MigroNet tenant via standard signup | Tenant created |
| 4.2 | Connect MigroNet MySQL database (read replica) | Database connector configured |
| 4.3 | Discover and select MigroNet tables (~60 tables) | Schema discovered, tables selected |
| 4.4 | Initial full sync of MigroNet data | Data in warehouse |
| 4.5 | Configure 15-minute incremental sync | Automated pipeline running |
| 4.6 | Build semantic model: "Case Pipeline" (cases, folders, persons, operations) | Model defined with 5+ metrics, 5+ dimensions |
| 4.7 | Build semantic model: "Team Performance" (tasks, users, departments) | Second model |
| 4.8 | Build semantic model: "Revenue & Payments" (operations, accounts) | Third model |
| 4.9 | Add REST API connector for BNR exchange rates | External API data flowing |
| 4.10 | Build dashboard: "Case Pipeline Overview" | Live dashboard |
| 4.11 | Build dashboard: "Revenue & Payments" | Live dashboard |
| 4.12 | Build dashboard: "Team Performance" | Live dashboard |
| 4.13 | Configure alerts: SLA breaches, revenue thresholds | Alerts active |
| 4.14 | Configure scheduled weekly report for management | Reports delivering |
| 4.15 | User acceptance testing with MigroNet team | Feedback collected |
| 4.16 | Fix issues discovered during validation | Bugs fixed, UX improved |

### Testing

- **Validation test**: MigroNet team uses dashboards daily for 2 weeks
- **Data accuracy**: Cross-check dashboard numbers against manual Excel KPIs
- **Performance**: All MigroNet dashboards load < 2s
- **Feedback loop**: Daily check-ins with MigroNet team

### Exit Criteria

- [ ] MigroNet team using dashboards daily (not falling back to Excel)
- [ ] Dashboard numbers match manual calculations (within 1% tolerance)
- [ ] No platform bugs blocking MigroNet usage
- [ ] At least 3 feature requests captured for Phase 5
- [ ] Zero custom code was needed (platform was sufficient)

---

## Phase 5: Growth (Ongoing, Week 27+)

### Immediate (Weeks 27–32)

| Initiative | Description |
|-----------|-------------|
| **Billing (Stripe)** | Subscription management, plan upgrades, invoicing |
| **Onboard 2–3 pilot tenants** | Recruit from network, validate with different data shapes |
| **Google Sheets connector** | Popular request, low effort |
| **MongoDB connector** | Expand database coverage |
| **Dashboard PDF export** | Export dashboards as PDF reports |
| **Embeddable dashboards** | iframe + scoped tokens for Business tier |

### Medium-Term (Weeks 33–42)

| Initiative | Description |
|-----------|-------------|
| **SaaS connectors** | Stripe, HubSpot, Shopify, QuickBooks |
| **Connector SDK + Marketplace** | Third-party developers build connectors |
| **White-label branding** | Custom logo, colors, domain for Business tier |
| **Kubernetes migration** | Move from Docker Compose to k3s |
| **AI-assisted modeling** | Auto-suggest metrics/dimensions from schema |
| **NLQ enhancements** | Advanced conversation memory, auto-suggested follow-ups, per-model fine-tuning |
| **Mobile dashboard viewer** | React Native or responsive web |

### Long-Term

| Initiative | Description |
|-----------|-------------|
| **Anomaly detection** | AI flags unusual metric movements |
| **Forecasting** | Time-series predictions based on historical data |
| **Data lineage visualization** | See where data flows from source to dashboard |
| **Reverse ETL** | Push analytics data back to SaaS tools |
| **SOC 2 certification** | Enterprise compliance |
| **Team expansion** | Hire 2–3 engineers, 1 designer |

---

## Resource Plan

| Phase | Duration | People | Role |
|-------|----------|--------|------|
| Phase 1 | 6 weeks | 1 (Alex) | Full-stack: NestJS services + Dagster pipelines + React UI |
| Phase 2 | 8 weeks | 1 (Alex) | Full-stack: semantic layer + query engine + dashboard UI |
| Phase 3 | 8 weeks | 1 (Alex) + part-time designer | Multi-tenant + auth + NLQ + landing page |
| Phase 4 | 4 weeks | 1 (Alex) + MigroNet team (testing) | Validation, bug fixes, UX iteration |
| Phase 5 | Ongoing | 1–2 developers | Growth features + scale |

### Key Milestones

| Week | Milestone |
|------|-----------|
| 6 | First data pipeline: connect DB → discover → sync → warehouse |
| 14 | First interactive dashboard with semantic model |
| 22 | Multi-tenant platform live with self-service signup + NLQ |
| 26 | MigroNet validated — team using dashboards daily |
| 30 | First paying tenant (not MigroNet) |
| 38 | 10 tenants, connector marketplace open |
