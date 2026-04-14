# System Architecture

Pulseboard is a multi-tenant analytics SaaS platform that lets businesses connect
their data sources, define metrics through a visual semantic layer, and build
interactive dashboards — all without writing SQL.

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Runtime** | Bun | JavaScript/TypeScript runtime for all backend services |
| **API Framework** | NestJS 10 + SWC | Microservices with dependency injection, CQRS support |
| **Frontend** | React + Vite | SPA with TanStack Router, TanStack Query, Tailwind v4 |
| **ORM** | Drizzle ORM | Type-safe SQL, dynamic query building, no code generation |
| **Database** | PostgreSQL 16 + TimescaleDB | Relational + time-series, schema-per-tenant warehouse |
| **Cache** | Redis 7 | Query result caching, session data, pub/sub |
| **Message Broker** | NATS + JetStream | Async events between services, pipeline signals |
| **ETL Orchestrator** | Dagster (Python) | Pipeline scheduling, asset materialization, monitoring |
| **Monorepo** | Turborepo + Bun workspaces | Build orchestration, dependency graph, caching |
| **Containerization** | Docker | Dev (hot reload) and prod (multi-stage optimized) |
| **Charts** | Apache ECharts | 50+ chart types, Canvas renderer, theming |

## Service Map

```
┌─────────────────────────────────────────────────────────────┐
│                     Dashboard SPA (React)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                     API Gateway (NestJS)                      │
│              Auth, rate limiting, tenant resolution           │
└───┬──────────┬───────────┬───────────┬──────────┬───────────┘
    │          │           │           │          │
┌───▼───┐ ┌───▼────┐ ┌────▼───┐ ┌────▼───┐ ┌───▼────┐
│Connec-│ │Semantic│ │ Query  │ │Dashbrd │ │ Alert  │
│tor Svc│ │Layer   │ │ Engine │ │ Svc    │ │ Svc    │
└───┬───┘ └────────┘ └────┬───┘ └────────┘ └────────┘
    │                      │
┌───▼──────────────────────▼──────────────────────────────────┐
│               PostgreSQL + TimescaleDB                       │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ platform │  │ warehouse_{n} │  │ pipeline_metadata    │  │
│  │ (shared) │  │ (per-tenant)  │  │ (Dagster internal)   │  │
│  └──────────┘  └───────────────┘  └──────────────────────┘  │
└──────────────────────────▲──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│              Dagster (ETL Orchestrator + Workers)             │
│              Extracts, transforms, loads per tenant           │
└─────────────────────────────────────────────────────────────┘
```

**Current state (Phase 1):** The API Gateway is a single NestJS application
handling auth, tenants, and (soon) connectors. It will be split into separate
services as complexity grows. The architecture is designed for this — each
NestJS module (AuthModule, TenantsModule, ConnectorModule, etc.) is a future
service boundary.

## Monorepo Structure

```
pulseboard/
├── apps/
│   ├── api-gateway/        NestJS — auth, health, tenants, connectors
│   └── web/                React SPA — dashboard UI
├── packages/
│   ├── shared-types/       Zod schemas shared across frontend + backend
│   └── shared-db/          Drizzle schema, ULID helpers, DB client
├── pipelines/              Python — Dagster ETL (future)
├── docs/
│   ├── architecture/       You are here
│   ├── guides/             How-to guides
│   └── planning/           Original project plans
├── docker-compose.yml      Production (multi-stage builds)
├── docker-compose.dev.yml  Development (hot reload)
└── turbo.json              Build pipeline config
```

## Package Dependency Graph

```
@pulseboard/web ──────────────► @pulseboard/shared-types
                                        ▲
@pulseboard/api-gateway ──────┬─────────┘
                              │
                              └───────► @pulseboard/shared-db
                                               │
                                               └───► @pulseboard/shared-types
```

`shared-types` is the leaf dependency — Zod schemas consumed by everything.
`shared-db` depends on `shared-types` and provides Drizzle table definitions.
Both apps depend on both shared packages.

## Communication Patterns

| Pattern | Used For | Transport |
|---------|----------|-----------|
| **Sync HTTP** | SPA → API, CRUD, queries | REST over HTTPS |
| **Async Events** | Pipeline completion, schema changes, alerts | NATS JetStream |
| **Shared DB** | Query Engine reads warehouse data | PostgreSQL |
| **Cache** | Query results, session, schema metadata | Redis |

## Module = Future Service Boundary

Each NestJS module is designed to become an independent service when scale
demands it. The current monolith approach is intentional — it's simpler to
develop, deploy, and debug with a single process. The split is a deployment
decision, not an architecture change.

```
Current (Phase 1):           Future (Phase 3+):
┌─────────────────────┐      ┌──────────────┐  ┌──────────────┐
│    API Gateway       │      │ API Gateway  │  │ Query Engine │
│                      │      │ (auth, route)│  │ (execute,    │
│  ├── AuthModule      │  →   └──────────────┘  │  cache)      │
│  ├── TenantsModule   │      ┌──────────────┐  └──────────────┘
│  ├── ConnectorModule │      │ Connector Svc│  ┌──────────────┐
│  ├── SemanticModule  │      │ (CRUD,       │  │ Dashboard Svc│
│  ├── QueryModule     │      │  discovery)  │  │ (widgets,    │
│  └── DashboardModule │      └──────────────┘  │  sharing)    │
└─────────────────────┘                         └──────────────┘
```
