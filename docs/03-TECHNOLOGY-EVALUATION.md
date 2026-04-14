# 03 — Technology Evaluation

## Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Ecosystem fit for analytics** | 25% | Libraries for ETL, data processing, charting |
| **CQRS/DDD/microservices maturity** | 20% | Framework support for the target architecture |
| **Developer productivity** | 15% | Tooling, type safety, debugging, testing |
| **Runtime performance** | 15% | Throughput for data processing and API serving |
| **Hiring / community** | 10% | Talent pool, ecosystem longevity |
| **Team familiarity** | 10% | Current team's comfort (Alex: Laravel/TS/React) |
| **Operational simplicity** | 5% | Container size, memory footprint, deployment ease |

---

## Option A: PHP — Laravel or Symfony

### Strengths

- **Team familiarity**: MigroNet is Laravel — no context switch for initial integration.
- **Laravel Horizon**: excellent queue/worker monitoring already in use.
- **Eloquent/Doctrine**: solid ORM layer.
- **Octane (Swoole/RoadRunner)**: long-running process performance.

### Weaknesses

- **Analytics ecosystem is thin**: no mature ETL frameworks, no first-class data pipeline tooling.
- **CQRS/DDD**: possible in Symfony (Messenger + Doctrine), but not idiomatic in Laravel. Laravel's active-record pattern fights DDD aggregates.
- **Data processing**: PHP is not designed for heavy data crunching. No native DataFrame concept, no streaming pipeline abstractions.
- **Multi-tenancy**: packages exist (stancl/tenancy) but the SaaS pivot adds friction.
- **Type system**: PHP 8.1+ has types, but not as rigorous as TypeScript.
- **Charting/visualization**: no server-side chart rendering ecosystem.

### Verdict

**Not recommended as primary stack.** PHP is great for CRUD APIs but is the weakest option for analytical workloads and the DDD/CQRS architecture. However, it can be used for a thin **integration bridge** (a Laravel package that pushes MigroNet events to the analytics platform).

| Criterion | Score (1-5) |
|-----------|-------------|
| Ecosystem fit for analytics | 2 |
| CQRS/DDD/microservices | 2.5 (Symfony) / 2 (Laravel) |
| Developer productivity | 4 |
| Runtime performance | 3 |
| Hiring / community | 4 |
| Team familiarity | 5 |
| Operational simplicity | 4 |
| **Weighted total** | **2.93** |

---

## Option B: TypeScript — NestJS on Bun (or Deno)

### Strengths

- **NestJS**: best-in-class DDD/CQRS support with `@nestjs/cqrs` module. First-class decorators, modules, dependency injection.
- **Type safety**: TypeScript gives compile-time guarantees across the entire stack (shared types with the React frontend).
- **Bun runtime**: significantly faster startup and HTTP throughput than Node.js. Native SQLite, built-in test runner, bundler.
- **Deno alternative**: secure by default, native TypeScript, built-in LSP. Slightly less mature ecosystem but very capable.
- **Shared language with frontend**: MigroNet-Client is already TypeScript/React. Shared DTOs, validation schemas (Zod), and types.
- **Microservices**: NestJS has built-in support for microservice transports (TCP, Redis, NATS, Kafka, gRPC, MQTT).
- **Bull/BullMQ**: mature job queue for scheduling ETL pipelines.
- **Prisma/Drizzle/TypeORM**: strong ORM options with migration support.
- **WebSocket/SSE**: native support for real-time dashboard updates.

### Weaknesses

- **Data processing**: not as strong as Python for heavy transforms. No native DataFrame.
- **Bun maturity**: Bun is production-ready for most use cases but some edge cases exist (less battle-tested than Node.js for enterprise).
- **Memory**: V8/Bun can be memory-hungry under heavy data loads compared to compiled languages.

### Bun vs Deno

| Aspect | Bun | Deno |
|--------|-----|------|
| npm compatibility | Near 100% — drop-in | Good, but some packages need `npm:` prefix |
| Performance | Fastest JS runtime benchmarks | Very fast, slightly behind Bun |
| NestJS support | Full support (runs as Node-compatible) | Experimental NestJS support |
| Ecosystem maturity | Rapidly maturing, large community | Stable, smaller community |
| Package management | Built-in (bun install, bun.lockb) | Built-in (deno.json, import maps) |
| Docker image size | ~150MB | ~130MB |

**Recommendation: Bun** — better NestJS compatibility and faster ecosystem adoption.

### Verdict

**Recommended for backend services and API layer.** NestJS on Bun gives the best CQRS/DDD developer experience with strong typing, microservice primitives, and full-stack TypeScript consistency.

| Criterion | Score (1-5) |
|-----------|-------------|
| Ecosystem fit for analytics | 3.5 |
| CQRS/DDD/microservices | 5 |
| Developer productivity | 4.5 |
| Runtime performance | 4.5 |
| Hiring / community | 4 |
| Team familiarity | 4 |
| Operational simplicity | 4 |
| **Weighted total** | **4.18** |

---

## Option C: Python

### Strengths

- **Data ecosystem is unmatched**: Pandas, Polars, DuckDB, Apache Arrow, SQLAlchemy, dbt, Airflow, Dagster, Prefect.
- **ETL tooling**: Airflow (industry standard), Dagster (modern alternative), Prefect (cloud-native), Meltano.
- **Data transformation**: Pandas/Polars for in-memory transforms, dbt for SQL-based transforms.
- **ML/AI readiness**: if analytics evolves into predictions, Python is the natural choice.
- **Connector ecosystem**: virtually every API has a Python SDK.

### Weaknesses

- **Web framework for APIs**: FastAPI/Django are good but NestJS is superior for DDD/CQRS patterns.
- **Type system**: type hints exist but are not enforced at runtime. Less rigorous than TypeScript.
- **Frontend disconnect**: no shared types with the React frontend.
- **Performance**: GIL limits concurrency for CPU-bound tasks (mitigated by async/multiprocessing but adds complexity).
- **DDD/CQRS**: no mature framework equivalent to NestJS CQRS. Would need custom implementation.

### Verdict

**Recommended for ETL pipelines and data processing only.** Python is the best tool for the data pipeline layer but should not be the API/dashboard backend.

| Criterion | Score (1-5) |
|-----------|-------------|
| Ecosystem fit for analytics | 5 |
| CQRS/DDD/microservices | 2.5 |
| Developer productivity | 4 |
| Runtime performance | 3 |
| Hiring / community | 5 |
| Team familiarity | 3 |
| Operational simplicity | 3.5 |
| **Weighted total** | **3.73** |

---

## Final Recommendation: Hybrid Stack

```
┌──────────────────────────────────────────────────────────────┐
│                    ANALYTICS PLATFORM                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend (Dashboard UI)     → TypeScript + React            │
│  API Gateway / BFF           → TypeScript + NestJS + Bun     │
│  Query Engine Service        → TypeScript + NestJS + Bun     │
│  Dashboard Config Service    → TypeScript + NestJS + Bun     │
│  Tenant Management Service   → TypeScript + NestJS + Bun     │
│                                                              │
│  ETL Orchestrator            → Python + Dagster              │
│  Data Connectors             → Python (DB, API connectors)   │
│  Data Transformations        → Python + Polars / dbt         │
│                                                              │
│  Data Warehouse              → PostgreSQL + TimescaleDB      │
│  Cache / Pub-Sub             → Redis                         │
│  Message Broker              → NATS (or Redis Streams)       │
│  Object Storage              → S3-compatible (MinIO dev)     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Why This Split Works

1. **TypeScript (NestJS/Bun)** handles the **CQRS/DDD domain logic**, API serving, real-time updates, and full-stack type sharing with the React dashboard.
2. **Python (Dagster)** handles the **data-heavy lifting** — extraction, transformation, scheduling — where its ecosystem is unmatched.
3. **Communication** between them is via the shared PostgreSQL warehouse + Redis pub/sub for events.
4. Each layer can **scale independently** — add more ETL workers without touching the API, or scale API horizontally without affecting pipelines.

### Technology Choices — Detail

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| API Runtime | **Bun** | Fastest TS runtime, native bundling, excellent DX |
| API Framework | **NestJS 10+** | CQRS module, DI, guards, interceptors, microservice transports |
| ORM | **Drizzle ORM** | Type-safe, lightweight, excellent PostgreSQL support, no heavy runtime |
| Validation | **Zod** | Shared with React frontend, runtime + compile-time safety |
| Job Queue | **BullMQ** | Redis-backed, repeatable jobs, dashboard (Bull Board) |
| ETL Orchestrator | **Dagster** | Modern, testable, asset-based pipelines, great UI |
| Data Transform | **Polars** | Blazing fast DataFrames (Rust-based), better than Pandas for large data |
| SQL Transform | **dbt-core** | SQL-based transformations, lineage, documentation |
| Data Warehouse | **PostgreSQL 16+ with TimescaleDB** | Mature, time-series extension, no separate OLAP needed at this scale |
| Cache | **Redis 7+** | Already used in MigroNet, query result caching, pub/sub |
| Message Broker | **NATS** | Lightweight, fast, supports JetStream for persistence |
| Frontend | **React 18 + Vite** | Consistent with MigroNet-Client |
| Charts | **Apache ECharts** (or Recharts) | Feature-rich, performant, good for dashboards |
| Dashboard Layout | **react-grid-layout** | Drag-and-drop grid for widget positioning |
| Auth | **OIDC/OAuth2** (Azure AD or self-hosted Keycloak for SaaS) | Standards-based, multi-tenant ready |
