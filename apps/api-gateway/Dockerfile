# ── Production Dockerfile for api-gateway ──
# Multi-stage build: build → production slim image

FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── Stage 1: Install + Build ──
FROM base AS build

# Copy workspace config and package files
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/shared-db/package.json packages/shared-db/
COPY apps/api-gateway/package.json apps/api-gateway/

# Install all dependencies
RUN bun install

# Copy source code
COPY packages/shared-types/ packages/shared-types/
COPY packages/shared-db/ packages/shared-db/
COPY apps/api-gateway/ apps/api-gateway/

# Build shared packages then api-gateway
RUN cd packages/shared-types && bun run build && \
    cd ../../packages/shared-db && bun run build && \
    cd ../../apps/api-gateway && bun run build

# ── Stage 2: Production image ──
FROM oven/bun:1-alpine AS production

WORKDIR /app

# Copy workspace root config
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/turbo.json ./turbo.json

# Copy package.json files for workspace resolution
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /app/packages/shared-db/package.json ./packages/shared-db/package.json
COPY --from=build /app/apps/api-gateway/package.json ./apps/api-gateway/package.json

# Install production dependencies (creates proper symlinks)
RUN bun install --production

# Copy built artifacts
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-db/dist ./packages/shared-db/dist
COPY --from=build /app/apps/api-gateway/dist ./apps/api-gateway/dist

# Non-root user
RUN addgroup -S pulseboard && adduser -S pulseboard -G pulseboard
USER pulseboard

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["bun", "apps/api-gateway/dist/main.js"]
