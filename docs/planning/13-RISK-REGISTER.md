# 13 — Risk Register & Decision Log

## Risk Register

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R1 | **Over-engineering** — building too much platform before validating demand | High | High | Phase 4 is a validation gate. If MigroNet can't be served without custom code, platform design is wrong. Strict phase gates. |
| R2 | **Semantic layer complexity** — visual model builder is the hardest UX problem | High | High | Start with a simpler version (dropdown-based, not visual graph). Iterate based on user testing. Study how Metabase and Holistics solve this. |
| R3 | **Query translation correctness** — semantic → SQL must produce correct results | Medium | Critical | Extensive test suite with known-good queries. Property-based testing. Compare semantic query results against hand-written SQL. |
| R4 | **Schema discovery edge cases** — databases have weird schemas, legacy tables, no FKs | High | Medium | Graceful degradation: if FKs not detected, let user manually define relationships. Support common naming conventions as heuristics. |
| R5 | **Bun runtime edge cases** | Medium | Low | Pin Bun version. Integration tests on every update. Node.js fallback is trivial (NestJS runs on both). |
| R6 | **Single developer bottleneck** | High | High | Comprehensive docs, CI/CD automation, clean architecture. Phase 3+ may need a second developer. |
| R7 | **PostgreSQL as warehouse at scale** | Low | Medium | Sufficient for target scale (SMBs, < 10M rows/tenant). Query engine interface is abstracted — ClickHouse migration is a service swap. |
| R8 | **Cross-tenant data leakage** | Low | Critical | Schema-per-tenant for warehouse (strongest isolation). RLS on platform tables. Automated isolation test suite runs in CI. Security audit before public launch. |
| R9 | **Connector maintenance burden** — each connector needs ongoing updates | Medium | Medium | Start with 4 connectors (MySQL, PG, CSV, REST API). Generic REST covers many APIs. Connector SDK pushes maintenance to third parties. |
| R10 | **Dagster learning curve** | Medium | Low | Good documentation and tutorials. Dagster's asset-based paradigm is intuitive. Alternative: Temporal or plain BullMQ if Dagster proves too heavy. |
| R11 | **Market fit uncertainty** — may not find paying customers | High | High | MigroNet validates product-market fit for consulting/service firms. 2–3 pilot tenants validate broader appeal before heavy growth investment. |
| R12 | **Performance at multi-tenant scale** — noisy neighbor problem | Medium | Medium | Per-tenant query timeouts. Redis cache reduces DB load. Materialized views handle dashboard queries. Monitor per-tenant resource usage. |
| R13 | **GDPR/compliance burden** | Medium | Medium | EU hosting (Hetzner Germany). Schema-per-tenant enables clean deletion. DPA template for Business+. Invest in formal compliance only after revenue validates. |
| R14 | **Generic REST connector UX** — configuring pagination, auth, response mapping is complex | High | Medium | Provide excellent defaults and auto-detection. Show sample response and let user click-to-map. Pre-built templates for common API patterns (cursor, offset, page). |
| R15 | **LLM provider dependency** — external API downtime affects NLQ | Medium | Medium | Multi-provider failover chain (Groq → Anthropic → OpenAI). Ollama self-hosted as air-gapped fallback. NLQ is never the only way to query — visual query builder always works. |
| R16 | **Prompt injection via NLQ** — malicious user input tries to manipulate LLM | Medium | Low | LLM output is validated against semantic model (only known metric/dimension slugs accepted). LLM never generates SQL directly. Structured JSON output format constrains the response space. |
| R17 | **NLQ cost runaway** — unexpected LLM usage spikes | Low | Medium | Per-tenant monthly quotas enforced by plan. Cache reduces actual LLM calls by ~40%. Cost per query is ~$0.001 (Groq) to ~$0.002 (Haiku). Platform-level budget alerts. |
| R18 | **LLM accuracy degradation** — model updates change NLQ quality | Medium | Medium | Accuracy test suite (~100 queries with expected outputs) runs against each provider/model before deployment. Version pinning for LLM models. Confidence scoring surfaces low-quality results for fallback. |
| R19 | **WebSocket scalability** — many concurrent connections per node | Low | Medium | Socket.IO handles ~10K connections per process. At our scale (<1000 concurrent users), single gateway is sufficient. NATS handles the fan-out. If needed, Socket.IO sticky sessions with Redis adapter for multi-process. |
| R20 | **Storage cost at scale** — large tenants uploading many files | Low | Medium | Per-tenant storage quotas by plan. Backblaze B2 ($0.005/GB) for archival. Auto-cleanup of old exports via retention policies. |

---

## Decision Log

| # | Decision | Date | Rationale | Alternatives Considered |
|---|----------|------|-----------|------------------------|
| D1 | **SaaS-first architecture** — MigroNet is tenant #1, not the foundation | 2026-04-11 | Prevents domain-specific assumptions leaking into the platform. Forces generic, reusable design. | MigroNet-first with SaaS pivot (original plan) |
| D2 | **Hybrid stack: TypeScript (NestJS/Bun) + Python (Dagster)** | 2026-04-10 | NestJS for DDD/CQRS API services, Python for data pipelines. Best of both ecosystems. | PHP-only, Python-only, TS-only |
| D3 | **PostgreSQL + TimescaleDB as warehouse** | 2026-04-10 | Sufficient at target scale. Avoid ClickHouse/Snowflake complexity. Abstracted behind interface for future swap. | ClickHouse, DuckDB, Snowflake |
| D4 | **Dagster over Airflow** | 2026-04-10 | Modern asset-based paradigm, better testing, cleaner DX. | Airflow, Prefect, Meltano |
| D5 | **Schema-per-tenant for warehouse** | 2026-04-11 | Strongest isolation for analytical data. Easy cleanup (DROP SCHEMA). Row-level for platform tables. | Row-level only, DB-per-tenant |
| D6 | **Apache ECharts for charting** | 2026-04-10 | 50+ chart types, Canvas renderer, theming engine, large dataset performance. | Recharts, Nivo, D3 |
| D7 | **Drizzle ORM** | 2026-04-10 | Lightweight, SQL-like API, good for analytical queries. Less runtime overhead than Prisma. | Prisma, TypeORM, Kysely |
| D8 | **NATS for messaging** | 2026-04-10 | Lightweight, JetStream for persistence. Kafka is overkill at this scale. | Kafka, RabbitMQ, Redis Streams |
| D9 | **Bun over Deno** | 2026-04-10 | Better NestJS compatibility, faster benchmarks. | Deno, Node.js |
| D10 | **Semantic layer as core differentiator** | 2026-04-11 | The gap between raw data and dashboards is the #1 pain point for SMBs. Metabase = raw SQL, Holistics = code. We = visual. | No semantic layer (Metabase approach), code-based (Holistics approach) |
| D11 | **Connector types defined via JSON schema** | 2026-04-11 | Enables dynamic config forms, third-party SDK, marketplace. No platform code change needed for new connectors. | Hard-coded connector implementations |
| D12 | **Dynamic Dagster asset generation** | 2026-04-11 | Pipelines are generated from tenant configs at runtime, not hard-coded per table. Scales to any tenant's schema. | Static asset definitions, one pipeline per connector type |
| D13 | **Self-hosted on Proxmox (Phase 1) → Talos K8s on bare-metal Mini PCs (Phase 2)** | 2026-04-11 | Leverages existing Proxmox cluster, zero cloud costs. Talos OS for K8s is immutable, minimal attack surface, perfect for bare-metal. 3 Mini PCs give HA + horizontal scaling. | Hetzner Cloud, AWS EKS, DigitalOcean K8s |
| D14 | **Longhorn for K8s persistent storage** | 2026-04-11 | Replicated block storage across bare-metal nodes. Simpler than Ceph, sufficient for 3-node cluster. | Rook-Ceph (overkill), OpenEBS LocalPV (no replication), NFS (SPOF) |
| D15 | **CloudNativePG for PostgreSQL HA on K8s** | 2026-04-11 | Operator-managed PG with automatic failover, backup, and TimescaleDB support. | Manual PG setup, Patroni (more complex), CrunchyData (heavier) |
| D16 | **OpenAI chat/completions as universal LLM protocol** | 2026-04-14 | De facto standard — Groq, OpenRouter, Ollama, and most providers already speak it. Custom tenant endpoints only need to implement one format. | Custom protocol per provider, gRPC |
| D17 | **Groq as primary NLQ provider** | 2026-04-14 | Fastest inference (~100-200ms for small prompts). Open models (Llama 3) are free to serve. Cheapest per-query cost. Anthropic Haiku as fallback for accuracy. | Anthropic-first (slower, more expensive), OpenAI-first |
| D18 | **Interface + Factory pattern for LLM providers** | 2026-04-14 | Inspired by migrobrain LLM interaction service. Adding new providers requires zero changes to NLQ service. Tenants can plug in custom endpoints. | Hardcoded provider switch, single provider only |
| D19 | **Socket.IO over raw WebSocket** | 2026-04-15 | Auto-reconnect, rooms (tenant isolation), fallback to long-polling, namespaces, binary support. Raw WS would need all of this built manually. | Raw WebSocket (lighter but no rooms/reconnect), SSE (no bidirectional, no rooms) |
| D20 | **WebSocket in API Gateway, not separate service** | 2026-04-15 | Fewer moving parts. NestJS supports WS gateways natively in the same process. Split to separate service only if WS connections become a bottleneck. | Separate WS microservice (more infra to manage) |
| D21 | **S3-compatible as universal storage protocol** | 2026-04-15 | S3 is the de facto standard — MinIO, B2, R2, GCS all speak it. One driver covers 5+ providers. Only Azure needs separate implementation. | Azure-first (locks out non-Azure), local filesystem only (doesn't scale) |

---

## Open Questions

| # | Question | Impact | Proposed Resolution |
|---|----------|--------|-------------------|
| Q1 | Product name and domain? | Branding, marketing | Decide before Phase 3 (landing page). Candidates in 01-MARKET-POSITIONING.md. |
| Q2 | Stripe vs Paddle for billing? | Payments, tax compliance | Paddle handles EU VAT automatically. Better for SaaS selling to EU SMBs. Evaluate both. |
| Q3 | How to handle very large tables (> 10M rows) in free tier? | Performance, cost | Row limit on sync (e.g., free: 100K rows max). Sampling option for discovery. |
| Q4 | Should the visual model builder use a graph/canvas UI or a simpler form-based UI? | UX complexity, dev time | Start form-based (simpler, faster to build). Add graph UI as an enhancement later. |
| Q5 | How to price embedded analytics? | Revenue, positioning | Per-view pricing is complex. Fixed per-plan is simpler. Start with "included in Business" and revisit. |
| Q6 | Should we support real-time streaming (Kafka/WebSocket) or stick with scheduled polling? | Architecture, complexity | Polling + webhooks cover 95% of use cases. Real-time streaming is a Phase 5+ feature for Enterprise. |
| Q7 | Do we need a separate read replica for MigroNet's database or can we query production directly? | Performance, risk | **Read replica strongly recommended**. Direct production queries risk impacting CRM performance. |

---

## Validation Checklist (Phase 4 Gate)

Before investing in Phase 5 (Growth), these must be true:

- [ ] MigroNet was onboarded using **only** generic platform features (zero custom code)
- [ ] MigroNet team uses dashboards **daily** and has **stopped using** Excel KPI tracker
- [ ] Dashboard data **matches** manual calculations within 1% tolerance
- [ ] At least **2 external parties** have expressed interest in using the platform
- [ ] Onboarding a new tenant takes **< 30 minutes** to first dashboard
- [ ] The platform has been running for **2+ weeks** without critical bugs
- [ ] **No cross-tenant data leakage** detected in automated test suite
