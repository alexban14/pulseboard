# Pulseboard Documentation

## Architecture

System design, decisions, and deep dives into each subsystem.

- [Overview](architecture/overview.md) — System architecture, service map, tech stack
- [Semantic Layer](architecture/semantic-layer.md) — How data modeling works (metrics, dimensions, query translation)
- [Connector Framework](architecture/connector-framework.md) — Pluggable data source connectors
- [Data Pipeline](architecture/data-pipeline.md) — ETL engine, warehouse schema, sync lifecycle
- [Multi-Tenancy](architecture/multi-tenancy.md) — Tenant isolation, resolution, plan gating
- [Authentication](architecture/authentication.md) — JWT, OIDC, multi-provider auth per tenant
- [Database Schema](architecture/database-schema.md) — Drizzle schema, ULID IDs, table relationships
- [WebSocket Gateway](architecture/websocket-gateway.md) — Real-time push (Socket.IO, NATS bridge, NLQ streaming)
- [Decision Log](architecture/decisions.md) — ADRs (Architecture Decision Records)

## Guides

How-to guides for development and operations.

- [Getting Started](guides/getting-started.md) — Clone, install, run
- [Docker](guides/docker.md) — Dev and prod Docker Compose setup
- [Adding a Service](guides/adding-a-service.md) — How to add a new NestJS microservice

## Planning

Original project plans, requirements, and roadmaps.

- [Planning docs](planning/) — 15 numbered documents covering market positioning, requirements, technology evaluation, architecture plans, and implementation roadmap
- [Progress Tracker](PROGRESS.md) — Phase-by-phase implementation checklist
