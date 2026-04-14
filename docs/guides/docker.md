# Docker Setup

Pulseboard uses two Docker Compose configurations:

| File | Purpose | Use Case |
|------|---------|----------|
| `docker-compose.dev.yml` | Hot reload, source-mounted | Day-to-day development |
| `docker-compose.yml` | Multi-stage optimized builds | Production / staging |

Both read configuration from `.env` (copy from `.env.example`).

## Development

```bash
make dev-up       # Start all services
make dev-down     # Stop all services
make dev-logs     # Tail logs from all services
```

### How Dev Mode Works

**Infrastructure** (PostgreSQL, Redis, NATS) runs as standard containers.

**API Gateway** runs in a `oven/bun:1-alpine` container with:
- Source code bind-mounted from the host
- `nest start --watch` for SWC-based recompilation on file changes
- `node_modules` in a named Docker volume (faster than bind mount)
- On startup: `bun install` → build shared packages → start with watch

**Web SPA** runs in a `oven/bun:1-alpine` container with:
- Source code bind-mounted from the host
- `vite --host 0.0.0.0` for HMR (Hot Module Replacement)
- Changes to `.tsx`/`.ts`/`.css` files reflect instantly in the browser

### First Run

The first `make dev-up` is slow (~45s) because containers need to:
1. Install all npm dependencies into the `node_modules_dev` volume
2. Build shared packages (`shared-types`, `shared-db`)
3. Start the dev servers

Subsequent runs skip step 1 (dependencies are cached in the volume).

### Rebuilding node_modules

If dependencies change (someone modifies a `package.json`):

```bash
docker compose -f docker-compose.dev.yml down -v   # removes volumes
make dev-up                                          # fresh install
```

## Production

```bash
make prod-up      # Build images + start
make prod-down    # Stop
make prod-build   # Build images only (no start)
make prod-logs    # Tail logs
```

### Image Architecture

**API Gateway** (`apps/api-gateway/Dockerfile`):
```
Stage 1 (build):   bun install + tsc/swc build
Stage 2 (prod):    bun install --production + copy dist
                   Non-root user, health check, ~257MB
```

**Web SPA** (`apps/web/Dockerfile`):
```
Stage 1 (build):   bun install + vite build
Stage 2 (prod):    nginx:alpine + copy dist/
                   SPA routing, gzip, cache headers, ~93MB
```

### Environment Variables

Production services receive env vars through Docker Compose `environment`
blocks, which read from `.env`:

```yaml
environment:
  DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
  JWT_SECRET: ${JWT_SECRET}
```

**Important:** Inside the Docker network, services reference each other by
container name (`postgres`, `redis`, `nats`), not `localhost`. The host port
mapping (e.g., `9001:5432`) is only for external access.

## Port Mapping

All host ports follow the `90xx` pattern and are `.env`-configurable:

```
9001  PostgreSQL
9002  Redis
9003  NATS
9004  NATS Monitor Dashboard
9010  API Gateway
9020  Web SPA
```

Override any port in `.env`:
```
API_PORT=8080
WEB_PORT=3000
```

## Volumes

| Volume | Purpose | Persists |
|--------|---------|----------|
| `pgdata` / `pgdata_dev` | PostgreSQL data | Yes (survives `down`) |
| `natsdata` / `natsdata_dev` | NATS JetStream | Yes |
| `node_modules_dev` | Dev npm packages | Yes (use `down -v` to reset) |

## Database Schema

After starting containers, push the Drizzle schema:

```bash
make db-push
```

This connects to PostgreSQL on `localhost:9001` and creates all tables.
