# ── Production Dockerfile for web SPA ──
# Multi-stage: build with Bun → serve with Nginx

FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── Stage 1: Install dependencies ──
FROM base AS deps

COPY package.json bun.lock turbo.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/web/package.json apps/web/

RUN bun install

# ── Stage 2: Build ──
FROM deps AS build

COPY tsconfig.base.json ./
COPY packages/shared-types/ packages/shared-types/
COPY apps/web/ apps/web/

# Vite embeds env vars at build time
ARG VITE_API_URL=http://localhost:3000/api
ENV VITE_API_URL=$VITE_API_URL

# Build shared-types first, then web
RUN cd packages/shared-types && bun run build && \
    cd ../../apps/web && bun run build

# ── Stage 3: Serve with Nginx ──
FROM nginx:alpine AS production

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Add our config (SPA routing + caching)
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built SPA
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
