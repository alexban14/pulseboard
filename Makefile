.PHONY: dev dev-up dev-down dev-logs dev-logs-api dev-logs-web \
       prod-up prod-down prod-logs prod-build \
       install build test lint typecheck clean \
       db-push db-studio db-generate

# ── Development (Docker, hot reload) ──

dev-up:
	docker compose -f docker-compose.dev.yml up -d

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

dev-logs-api:
	docker compose -f docker-compose.dev.yml logs -f api-gateway

dev-logs-web:
	docker compose -f docker-compose.dev.yml logs -f web

# ── Production (Docker, optimized builds) ──

prod-up:
	docker compose up -d --build

prod-down:
	docker compose down

prod-logs:
	docker compose logs -f

prod-build:
	docker compose build

# ── Local development (no Docker for apps) ──

install:
	bun install

dev:
	bun run dev

build:
	bun run build

test:
	bun run test

lint:
	bun run lint

typecheck:
	bun run typecheck

clean:
	bun run clean

# ── Database ──

db-push:
	cd packages/shared-db && DATABASE_URL=$${DATABASE_URL:-postgresql://pulseboard:pulseboard_dev@localhost:9001/pulseboard} bun run push

db-studio:
	cd packages/shared-db && DATABASE_URL=$${DATABASE_URL:-postgresql://pulseboard:pulseboard_dev@localhost:9001/pulseboard} bun run studio

db-generate:
	cd packages/shared-db && bun run generate
