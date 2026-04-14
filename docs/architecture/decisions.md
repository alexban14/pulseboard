# Architecture Decision Records (ADRs)

Each decision records what was chosen, why, and what alternatives were considered.

---

## ADR-001: SaaS-First Architecture

**Date:** 2026-04-11
**Status:** Accepted

**Context:** The platform was originally planned as a MigroNet-specific analytics
tool with a future SaaS pivot. This would have baked domain-specific assumptions
(case pipelines, tax recovery, etc.) into the core platform.

**Decision:** Build as a generic SaaS from day one. MigroNet is onboarded as
tenant #1 using only generic platform features (no custom code).

**Consequences:**
- Every feature must work for any business domain, not just tax consulting
- Schema discovery and semantic layer are required (not pre-built data models)
- Validation gate: if MigroNet needs custom code, the platform design is wrong

---

## ADR-002: TypeScript (NestJS + Bun) + Python (Dagster) Hybrid Stack

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Three options evaluated: PHP (Laravel/Symfony), TypeScript (NestJS),
Python. Full scoring in `docs/planning/03-TECHNOLOGY-EVALUATION.md`.

**Decision:** TypeScript for API services, Python for ETL pipelines.

**Rationale:**
- NestJS has the best CQRS/DDD support in the JS/TS ecosystem
- Bun provides fast runtime with transparent ESM/CJS interop
- Python has an unmatched data ecosystem (Dagster, Polars, dbt)
- Full-stack TypeScript shares types between frontend and backend (Zod schemas)

**Alternatives rejected:**
- PHP-only: weak analytics/ETL ecosystem
- Python-only: weak DDD/CQRS frameworks (FastAPI is good but not NestJS-level)
- TypeScript-only: weak ETL tooling

---

## ADR-003: Drizzle ORM over Prisma

**Date:** 2026-04-11
**Status:** Accepted

**Context:** Need a TypeScript ORM for PostgreSQL that supports dynamic query
building for the analytics query engine.

**Decision:** Drizzle ORM.

**Rationale:**
- ESM-native, no code generation step (`prisma generate`)
- SQL-close API — critical for translating semantic model queries into dynamic SQL
- No binary runtime (Prisma ships a ~15MB Rust query engine)
- Supports raw `sql` tagged templates for dynamic DDL (creating warehouse tables)
- Lighter Docker images

**Alternatives rejected:**
- Prisma: code generation, heavy runtime, abstracts SQL too much for analytics
- TypeORM: less type-safe, aging API
- Kysely: query builder only, no migration tooling

---

## ADR-004: ULID over UUID v4 for Primary Keys

**Date:** 2026-04-11
**Status:** Accepted

**Context:** Need globally unique identifiers for all entities.

**Decision:** ULIDs stored as `varchar(26)`.

**Rationale:**
- Lexicographically sortable (time-ordered) — better B-tree index performance
- No sequential scan needed for "latest N" queries — natural ordering
- First 48 bits encode millisecond timestamp — useful for debugging
- 26 characters vs UUID's 36 — shorter URLs, smaller storage
- Generated at application level (no DB dependency)

**Alternatives rejected:**
- UUID v4: random distribution causes B-tree page splits
- UUID v7: time-ordered but longer (36 chars), less ecosystem support
- Auto-increment: not globally unique, leaks information

---

## ADR-005: ESM Throughout (No CommonJS)

**Date:** 2026-04-12
**Status:** Accepted

**Context:** NestJS traditionally uses CommonJS. Drizzle ORM and postgres.js are
ESM-only packages. Mixing module systems caused build and runtime failures.

**Decision:** Full ESM across the entire monorepo. `"type": "module"` in every
package.json. `module: "NodeNext"` in base tsconfig.

**Consequences:**
- All relative imports need `.js` extensions (`import x from './foo.js'`)
- NestJS uses SWC compiler (handles ESM natively, 72ms builds)
- Bun runtime required (Node.js has lingering ESM resolution issues)
- Web app (Vite) uses `module: "ESNext"` with `moduleResolution: "bundler"`
  override since Vite handles resolution itself

---

## ADR-006: Bun as Runtime

**Date:** 2026-04-12
**Status:** Accepted

**Context:** Node.js v25 has ESM support but still fails on directory imports
and some workspace module resolution patterns. The platform uses ESM throughout.

**Decision:** Use Bun as the runtime for all backend services.

**Rationale:**
- Transparent ESM/CJS interop — resolves modules Node.js can't
- Faster startup and HTTP throughput
- Built-in workspace support
- Same V8-like behavior for NestJS decorators and reflect-metadata
- Docker images use `oven/bun:1-alpine` base

**Alternatives rejected:**
- Node.js: ESM resolution issues with Bun's module layout
- Deno: experimental NestJS support

---

## ADR-007: Schema-Per-Tenant for Warehouse Data

**Date:** 2026-04-11
**Status:** Accepted

**Context:** Need to isolate each tenant's analytical data in the warehouse.

**Decision:** Each tenant gets a PostgreSQL schema (`warehouse_{tenant_id_prefix}`)
for their synced data. Platform tables use row-level isolation.

**Rationale:**
- Strongest isolation for the data tenants care most about (their business data)
- Easy cleanup: `DROP SCHEMA warehouse_abc CASCADE` on tenant deletion
- Per-tenant performance tuning possible (separate tablespaces)
- Platform tables (tenants, dashboards) use simpler row-level + RLS

**Alternatives rejected:**
- Row-level only: insufficient isolation for warehouse data
- Separate databases: too much operational overhead

---

## ADR-008: Apache ECharts for Charting

**Date:** 2026-04-10
**Status:** Accepted

**Context:** Need a charting library that supports 10+ chart types, handles large
datasets, and supports theming for white-label.

**Decision:** Apache ECharts (via `echarts-for-react`).

**Rationale:**
- 50+ chart types (most feature-rich option)
- Canvas renderer — handles 10K+ data points without SVG DOM overhead
- Built-in theming engine — critical for white-label branding
- Drill-down, brush zoom, and data zoom built-in
- Apache Foundation backed — long-term maintenance

**Alternatives rejected:**
- Recharts: simpler but SVG-based (slow with large datasets), fewer chart types
- Nivo: good but SVG-only, moderate community
- D3: too low-level for a dashboard product
- Victory: fewer features, smaller community

---

## ADR-009: Docker Port Pattern (90xx)

**Date:** 2026-04-14
**Status:** Accepted

**Context:** Multiple projects run on the same development machine. Default ports
(3000, 5432, 6379) frequently conflict.

**Decision:** All Pulseboard host ports use a `90xx` pattern, configurable via `.env`.

```
PostgreSQL   → 9001
Redis        → 9002
NATS         → 9003
NATS Monitor → 9004
API Gateway  → 9010
Web SPA      → 9020
```

**Rationale:** Sequential, predictable, avoids all common port conflicts. Easy to
remember. Overridable per-developer via `.env`.

---

## ADR-010: Self-Hosted Infrastructure (Proxmox → Talos K8s)

**Date:** 2026-04-11
**Status:** Accepted

**Context:** Need to decide where to host the platform.

**Decision:** Phase 1 on Proxmox VM (existing cluster). Phase 2 on 3 dedicated
Mini PCs running Talos OS (Kubernetes).

**Rationale:**
- Zero cloud costs — existing hardware
- EU data residency by default (on-premise)
- Talos OS: immutable, API-managed, minimal attack surface, built for bare-metal
- Longhorn for replicated storage across nodes
- Migration path is additive — Talos cluster runs alongside Proxmox

**Alternatives rejected:**
- Hetzner Cloud: good pricing but unnecessary cost when hardware exists
- AWS/Azure: expensive, complex, not needed at bootstrap scale
