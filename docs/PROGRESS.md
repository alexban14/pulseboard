# Pulseboard — Implementation Progress

> Multi-tenant analytics SaaS platform.
> Full plan details in the numbered docs (00–13) in this directory.

---

## Phase 1: Platform Core (Target: 6 weeks)

### Monorepo & Infrastructure

- [x] 1.1 — Initialize Turborepo monorepo with Bun workspace
- [x] 1.2 — Scaffold NestJS api-gateway (health, auth, tenants stubs)
- [x] 1.3 — Set up shared-types package (Zod schemas: tenant, connector, model, dashboard, query, auth)
- [x] 1.4 — Drizzle ORM + PostgreSQL schema (tenants, users, connectors, sync_tables, sync_runs) — ULID IDs
- [x] 1.5 — Tenant service: create tenant, user management, JWT auth backed by DB
- [x] 1.6 — Docker Compose: PostgreSQL+TimescaleDB, Redis, NATS
- [x] 1.7 — GitHub Actions CI: lint + test + build
- [x] 1.8 — React SPA scaffold (Vite + TanStack Router + TanStack Query + Tailwind v4)

### Connector System

- [x] 1.9 — Connector type registry: MySQL, PostgreSQL, REST API, CSV built-in
- [x] 1.10 — Connector service (NestJS): instance CRUD, test connection, AES-256-GCM encryption
- [x] 1.11 — Schema discovery: database introspection (tables, columns, types, PKs, FKs, row counts)
- [x] 1.12 — Table selection UI: pick which tables to sync
- [x] 1.13 — Connector management UI pages (add/edit/test/monitor)

### ETL Pipeline

- [x] 1.14 — Dagster project scaffold with Python
- [x] 1.15 — Database connector (Python): full + incremental extraction (MySQL + PG)
- [x] 1.16 — Warehouse loader: dynamic table creation, upsert, schema evolution
- [x] 1.17 — Sync scheduling: Dagster sensor auto-triggers healthy connectors every 60s
- [x] 1.18 — Pipeline monitoring: sync runs tracked in DB, Dagster UI at :9030

### File Connector

- [x] 1.19 — CSV/Excel upload connector + manual sync trigger

---

## Phase 2: Dashboard + Semantic Layer (Target: 8 weeks)

### Semantic Layer

- [ ] 2.1 — Semantic service: model CRUD API
- [ ] 2.2 — Visual model builder UI: add tables, define joins
- [ ] 2.3 — Metric definition UI: create metrics from columns + aggregations
- [ ] 2.4 — Dimension definition UI: categorical and temporal
- [ ] 2.5 — Calculated field definition: expression builder
- [ ] 2.6 — Named filters: reusable filter conditions

### Query Engine

- [ ] 2.7 — Query Engine service: translate QueryDefinition → SQL → execute
- [ ] 2.8 — Query result caching (Redis) with TTL
- [ ] 2.9 — Visual query builder UI
- [ ] 2.10 — Save, name, share queries

### Dashboard UI

- [ ] 2.11 — Dashboard service: dashboard + widget CRUD
- [ ] 2.12 — Dashboard grid UI (react-grid-layout): drag, drop, resize
- [ ] 2.13 — Widget renderer (ECharts): KPI card, line, bar, pie, table
- [ ] 2.14 — Widget configuration dialog
- [ ] 2.15 — Global dashboard filters (date range, dimension filters)
- [ ] 2.16 — Additional widget types: area, donut, funnel, heatmap, gauge, scatter

### Real-Time (WebSocket Gateway)

- [ ] 2.17 — WebSocket gateway in api-gateway (@nestjs/websockets + Socket.IO)
- [ ] 2.18 — Auth: JWT validation on WS handshake, tenant-scoped rooms
- [ ] 2.19 — NATS → WebSocket bridge: subscribe to NATS events, push to connected clients
- [ ] 2.20 — Pipeline sync progress: live rows synced, status changes pushed to frontend
- [ ] 2.21 — Dashboard live refresh: push data invalidation on sync completion (replaces polling)
- [ ] 2.22 — Frontend: useRealtimeSocket hook + connection status indicator

### Reporting & Alerts

- [ ] 2.23 — Query export: Excel, CSV download
- [ ] 2.24 — Pre-computed aggregations (materialized views)
- [ ] 2.25 — Aggregation refresh on sync completion
- [ ] 2.26 — Dashboard sharing: link-based, role-based
- [ ] 2.27 — Alert service: threshold rules, email notifications
- [ ] 2.28 — Scheduled reports: cron → email delivery

---

## Phase 3: Multi-Tenant + Auth + NLQ (Target: 8 weeks)

### Multi-Tenant & Auth

- [ ] 3.1 — Self-service tenant signup
- [ ] 3.2 — Onboarding wizard: connect → discover → sync → model → dashboard
- [ ] 3.3 — PostgreSQL RLS policies on all platform tables
- [ ] 3.4 — Tenant resolution: subdomain, custom domain, JWT
- [ ] 3.5 — OIDC auth: Azure AD, Google Workspace
- [ ] 3.6 — Connector credential encryption (AES-256-GCM)
- [ ] 3.7 — Plan definition + feature gating
- [ ] 3.8 — Tenant admin UI: users, roles, settings
- [ ] 3.9 — User invitation flow
- [ ] 3.10 — Generic REST API connector
- [ ] 3.11 — Webhook connector
- [ ] 3.12 — MariaDB + SQL Server connectors
- [ ] 3.13 — Dashboard templates
- [ ] 3.14 — Widget drill-down
- [ ] 3.15 — Dashboard auto-refresh
- [ ] 3.16 — Landing page / marketing site

### Natural Language Queries (NLQ) — [Full plan](planning/14-NATURAL-LANGUAGE-QUERIES.md)

- [ ] 3.17 — NLQ service scaffold (NestJS module, LLM provider interface)
- [ ] 3.18 — Claude Haiku provider implementation
- [ ] 3.19 — Prompt construction from semantic model context
- [ ] 3.20 — Response parsing + Zod validation + slug resolution
- [ ] 3.21 — Retry logic (validation failure → retry with error context)
- [ ] 3.22 — Query cache (Redis, normalized exact match)
- [ ] 3.23 — API endpoint: POST /api/nlq/query
- [ ] 3.24 — NLQ WebSocket streaming: stream LLM tokens to frontend via WS gateway
- [ ] 3.25 — Frontend: NLQ input bar + streaming result rendering
- [ ] 3.26 — Conversation support (multi-turn follow-ups)
- [ ] 3.27 — Clarification UI (low confidence → ask user)
- [ ] 3.28 — Suggested queries (per model, cached)
- [ ] 3.29 — "Save as Widget" + "Edit in Query Builder" from NLQ results
- [ ] 3.30 — OpenAI fallback provider
- [ ] 3.31 — Ollama self-hosted provider
- [ ] 3.32 — BYOK (Bring Your Own Key) tenant config
- [ ] 3.33 — Usage tracking + plan quota enforcement
- [ ] 3.34 — NLQ query history table + API

---

## Phase 4: MigroNet Validation (Target: 4 weeks)

- [ ] 4.1 — Create MigroNet tenant
- [ ] 4.2 — Connect MigroNet MySQL database
- [ ] 4.3 — Discover and select tables (~60)
- [ ] 4.4 — Initial full sync
- [ ] 4.5 — Configure 15-minute incremental sync
- [ ] 4.6 — Semantic model: "Case Pipeline"
- [ ] 4.7 — Semantic model: "Team Performance"
- [ ] 4.8 — Semantic model: "Revenue & Payments"
- [ ] 4.9 — REST API connector for BNR exchange rates
- [ ] 4.10 — Dashboard: Case Pipeline Overview
- [ ] 4.11 — Dashboard: Revenue & Payments
- [ ] 4.12 — Dashboard: Team Performance
- [ ] 4.13 — Configure alerts
- [ ] 4.14 — Scheduled weekly report
- [ ] 4.15 — User acceptance testing
- [ ] 4.16 — Fix issues from validation

---

## Phase 5: Growth (Ongoing)

- [ ] Stripe billing integration
- [ ] Onboard 2–3 pilot tenants
- [ ] Google Sheets connector
- [ ] MongoDB connector
- [ ] Dashboard PDF export
- [ ] Embeddable dashboards
- [ ] SaaS connectors (Stripe, HubSpot, Shopify)
- [ ] Connector SDK + Marketplace
- [ ] White-label branding
- [ ] Kubernetes migration (Talos OS on Mini PCs)
- [ ] AI-assisted modeling (auto-suggest metrics/dimensions from schema)
