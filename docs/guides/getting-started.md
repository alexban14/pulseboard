# Getting Started

## Prerequisites

- [Bun](https://bun.sh/) v1.3+
- [Docker](https://www.docker.com/) with Docker Compose v2
- Git

## Clone and Install

```bash
git clone git@github.com:alexban14/pulseboard.git
cd pulseboard
cp .env.example .env
bun install
```

## Development (Docker — recommended)

Start everything in Docker with hot reload:

```bash
make dev-up
```

This starts:
- **PostgreSQL + TimescaleDB** on port `9001`
- **Redis** on port `9002`
- **NATS** on port `9003`
- **API Gateway** on port `9010` (NestJS with SWC watch mode)
- **Web SPA** on port `9020` (Vite dev server with HMR)

First run takes ~45 seconds (installs dependencies inside containers).
Subsequent starts are near-instant.

**Push the database schema** (first time only):

```bash
make db-push
```

**View logs:**

```bash
make dev-logs          # all services
make dev-logs-api      # api-gateway only
make dev-logs-web      # web SPA only
```

**Stop:**

```bash
make dev-down
```

## Development (Local — no Docker for apps)

If you prefer running apps directly on your machine:

```bash
# Start only infrastructure
docker compose -f docker-compose.dev.yml up -d postgres redis nats

# Push schema
make db-push

# Start API (in one terminal)
cd apps/api-gateway
cp ../../.env.example .env  # adjust DATABASE_URL to localhost:9001
bun run dev

# Start Web (in another terminal)
cd apps/web
bun run dev
```

## Production (Docker)

Build optimized images and run:

```bash
make prod-up
```

This builds multi-stage Docker images (API: ~257MB, Web: ~93MB) and runs
them with health checks and restart policies.

## Verify

```bash
# Health check
curl http://localhost:9010/api/health

# Register a test tenant
curl -X POST http://localhost:9010/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234","tenantName":"Test","tenantSlug":"test"}'

# Web SPA
open http://localhost:9020
```

## Port Reference

All ports are configurable via `.env`:

| Service | Port | Env Var |
|---------|------|---------|
| PostgreSQL | 9001 | `POSTGRES_PORT` |
| Redis | 9002 | `REDIS_PORT` |
| NATS | 9003 | `NATS_PORT` |
| NATS Monitor | 9004 | `NATS_MONITOR_PORT` |
| API Gateway | 9010 | `API_PORT` |
| Web SPA | 9020 | `WEB_PORT` |

## Database Tools

```bash
make db-push      # Push schema changes to PostgreSQL
make db-generate  # Generate migration files from schema changes
make db-studio    # Open Drizzle Studio (visual DB browser)
```

## Build

```bash
make build        # Build all packages (Turborepo)
make typecheck    # Type-check without building
make lint         # Run linters
make test         # Run tests
```
