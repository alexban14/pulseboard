# 11 — Infrastructure & Deployment

## Infrastructure Overview

All infrastructure runs on **self-hosted hardware** — no cloud providers.

| Phase | Platform | Where |
|-------|----------|-------|
| **Phase 1** (dev + initial prod) | Docker Compose | Proxmox VM on existing cluster |
| **Phase 2** (SaaS scale) | Kubernetes (Talos OS) | 3 dedicated high-end Mini PCs |

---

## Phase 1: Docker Compose on Proxmox

The analytics platform runs as a Docker Compose stack inside a **Proxmox VM**
on the existing cluster (same infrastructure that hosts MigroNet).

### Proxmox VM Spec (Recommended)

| Resource | Allocation | Rationale |
|----------|-----------|-----------|
| vCPU | 8 cores | NestJS services + Dagster workers + PG |
| RAM | 16–32 GB | PostgreSQL + TimescaleDB needs room for caching |
| Storage | 200 GB SSD (thin provisioned) | Warehouse data grows per tenant |
| Network | Bridged, static IP on internal network | Accessible from Traefik/reverse proxy |
| OS | Debian 12 or Ubuntu 24.04 LTS | Docker-friendly, minimal footprint |

### Proxmox Setup

```
┌─────────────────────────────────────────────────────────┐
│                    PROXMOX CLUSTER                       │
│                                                         │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │ Existing VMs         │  │ analytics-prod (new VM)   │ │
│  │                      │  │                           │ │
│  │  migronet-api        │  │  Docker Compose stack:    │ │
│  │  migronet-client     │  │   api-gateway             │ │
│  │  semneaza (documenso)│  │   connector-service       │ │
│  │  semneaza-api        │  │   semantic-service        │ │
│  │  mariadb             │  │   query-engine            │ │
│  │  redis               │  │   dashboard-service       │ │
│  │  soketi              │  │   tenant-service          │ │
│  │  traefik             │  │   alert-service           │ │
│  │                      │  │   web (SPA)               │ │
│  │                      │  │   postgresql+timescaledb  │ │
│  │                      │  │   redis                   │ │
│  │                      │  │   nats                    │ │
│  │                      │  │   dagster (web+daemon)    │ │
│  │                      │  │   dagster-workers (1-N)   │ │
│  └─────────────────────┘  └───────────────────────────┘ │
│                                                         │
│  Shared: Traefik reverse proxy routes to analytics VM   │
│  DNS: analytics.yourdomain.com → Traefik → analytics VM │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Networking

The analytics VM sits on the same internal network as the MigroNet stack.
This is important because:

- The MigroNet MySQL connector needs to reach the MigroNet MariaDB directly
  (read replica or direct, internal network — no public exposure)
- Traefik (already running for MigroNet) can route analytics traffic via
  a new virtual host rule
- No additional firewall rules needed between Proxmox VMs

```
External traffic:
  analytics.yourdomain.com → Traefik → analytics-prod:80 (web SPA)
  api.analytics.yourdomain.com → Traefik → analytics-prod:3000 (API gateway)

Internal traffic:
  analytics-prod → migronet-mariadb:3306 (MigroNet DB connector, read-only)
```

### Container Map

```
┌───────────────────────────────────────────────────────────┐
│          Docker Compose Stack (analytics-prod VM)          │
│                                                           │
│  ┌─────────────────┐  ┌─────────────────┐                │
│  │ web (SPA)       │  │ api-gateway     │                │
│  │ Nginx + static  │  │ NestJS + Bun    │                │
│  │ :80             │  │ :3000           │                │
│  └─────────────────┘  └────────┬────────┘                │
│                                │                         │
│  ┌──────────────┐  ┌──────────┼──────────┐               │
│  │connector-svc │  │  ┌───────▼───────┐  │               │
│  │ :3001        │  │  │ query-engine  │  │               │
│  └──────────────┘  │  │ :3002         │  │               │
│  ┌──────────────┐  │  └───────────────┘  │               │
│  │semantic-svc  │  │  ┌───────────────┐  │               │
│  │ :3003        │  │  │dashboard-svc  │  │               │
│  └──────────────┘  │  │ :3004         │  │               │
│  ┌──────────────┐  │  └───────────────┘  │               │
│  │ tenant-svc   │  │  ┌───────────────┐  │               │
│  │ :3005        │  │  │ alert-svc     │  │               │
│  └──────────────┘  │  │ :3006         │  │               │
│                    │  └───────────────┘  │               │
│                    └────────────────────┘                │
│                                                           │
│  ┌──────────────────────────────────────┐                │
│  │  PostgreSQL 16 + TimescaleDB         │                │
│  │  :5432                               │                │
│  └──────────────────────────────────────┘                │
│  ┌──────────────┐  ┌───────────────────┐                │
│  │ Redis 7      │  │ NATS + JetStream  │                │
│  │ :6379        │  │ :4222             │                │
│  └──────────────┘  └───────────────────┘                │
│                                                           │
│  ┌──────────────────────────────────────┐                │
│  │  Dagster (webserver + daemon)        │                │
│  │  :3070                               │                │
│  ├──────────────────────────────────────┤                │
│  │  Dagster Workers (scalable: 1-N)     │                │
│  └──────────────────────────────────────┘                │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Storage Strategy

| Data | Location | Backup |
|------|----------|--------|
| PostgreSQL data | Proxmox volume (SSD-backed) | Proxmox snapshots + pg_dump daily |
| Redis (cache only) | Ephemeral (no persistence needed) | None — cache is rebuilt |
| NATS JetStream | Proxmox volume | Proxmox snapshots |
| Uploaded files (CSV) | Proxmox volume or NFS share | Proxmox snapshots |

### Backup Strategy

```
Daily:
  - pg_dump analytics DB → compressed → stored on separate Proxmox storage pool
  - Proxmox VM snapshot (weekly full, daily incremental)

Retention:
  - Daily backups: 14 days
  - Weekly snapshots: 8 weeks
  - Monthly: 6 months
```

### Dockerfile Example (NestJS Service)

```dockerfile
FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lockb turbo.json ./
COPY apps/api-gateway/package.json apps/api-gateway/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/shared-db/package.json packages/shared-db/
COPY packages/shared-auth/package.json packages/shared-auth/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build --filter=api-gateway

FROM base AS production
COPY --from=build /app/apps/api-gateway/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "run", "dist/main.js"]
```

---

## Phase 2: Kubernetes on Talos OS (3-Node Bare-Metal Cluster)

When the platform needs horizontal scaling, HA, or serves enough tenants to
justify the operational overhead, migrate to a dedicated Kubernetes cluster.

### Hardware: 3 High-End Mini PCs

```
┌──────────────────────────────────────────────────────────┐
│                TALOS OS K8s CLUSTER                        │
│                                                          │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────┐ │
│  │  Node 1         │ │  Node 2         │ │  Node 3      │ │
│  │  Mini PC        │ │  Mini PC        │ │  Mini PC     │ │
│  │                 │ │                 │ │              │ │
│  │  Control Plane  │ │  Control Plane  │ │ Control Plane│ │
│  │  + Worker       │ │  + Worker       │ │  + Worker    │ │
│  │                 │ │                 │ │              │ │
│  │  Roles:         │ │  Roles:         │ │  Roles:      │ │
│  │  - API services │ │  - API services │ │  - Dagster   │ │
│  │  - PostgreSQL   │ │  - PostgreSQL   │ │  - Workers   │ │
│  │    (primary)    │ │    (replica)    │ │  - Overflow  │ │
│  │  - Redis        │ │  - NATS         │ │              │ │
│  └────────────────┘ └────────────────┘ └──────────────┘ │
│                                                          │
│  Network: Internal LAN, single external IP via           │
│           Traefik Ingress or MetalLB                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Why Talos OS

| Feature | Benefit |
|---------|---------|
| **Immutable OS** | No SSH, no shell, no drift — the entire OS is the K8s config |
| **API-managed** | All config via `talosctl` — declarative, versionable, reproducible |
| **Minimal attack surface** | No package manager, no userland — only K8s components run |
| **Automatic updates** | Rolling OS upgrades without draining nodes manually |
| **Lightweight** | ~80MB image, boots in seconds, maximal resources for workloads |
| **Bare-metal friendly** | Designed for bare-metal, not just cloud VMs |

### Talos Cluster Setup

```yaml
# talos/controlplane.yaml (applied to all 3 nodes)
machine:
  type: controlplane
  network:
    hostname: analytics-node-1
    interfaces:
      - interface: eth0
        dhcp: false
        addresses:
          - 192.168.1.101/24   # static IP per node
        routes:
          - network: 0.0.0.0/0
            gateway: 192.168.1.1
  install:
    disk: /dev/nvme0n1
    image: ghcr.io/siderolabs/installer:latest

cluster:
  clusterName: analytics-cluster
  controlPlane:
    endpoint: https://192.168.1.100:6443  # VIP or load balancer
  network:
    cni:
      name: cilium    # or flannel for simplicity
    podSubnets:
      - 10.244.0.0/16
    serviceSubnets:
      - 10.96.0.0/12
  proxy:
    disabled: true  # Cilium replaces kube-proxy
```

### Talos Bootstrap Commands

```bash
# Generate cluster config
talosctl gen config analytics-cluster https://192.168.1.100:6443

# Apply to each node
talosctl apply-config --insecure --nodes 192.168.1.101 --file controlplane.yaml
talosctl apply-config --insecure --nodes 192.168.1.102 --file controlplane.yaml
talosctl apply-config --insecure --nodes 192.168.1.103 --file controlplane.yaml

# Bootstrap the cluster (run once on the first node)
talosctl bootstrap --nodes 192.168.1.101

# Get kubeconfig
talosctl kubeconfig --nodes 192.168.1.101
```

### Storage on Bare-Metal

Since there's no cloud block storage, use one of:

| Option | Pros | Cons |
|--------|------|------|
| **Longhorn** (recommended) | Replicated block storage across nodes, UI, snapshots, backups | Some CPU/network overhead |
| **OpenEBS (LocalPV)** | Simple, fast, local NVMe access | No replication — single node failure = data unavailable |
| **Rook-Ceph** | Enterprise-grade, distributed | Heavy, complex, overkill for 3 nodes |
| **NFS from Proxmox** | Leverage existing Proxmox storage | Single point of failure, network latency |

**Recommendation**: **Longhorn** for replicated persistent volumes.
PostgreSQL data is replicated across 2 nodes (primary + replica), so even if
one Mini PC dies, data and service continue.

```yaml
# Longhorn StorageClass
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn-replicated
provisioner: driver.longhorn.io
parameters:
  numberOfReplicas: "2"
  staleReplicaTimeout: "2880"
  dataLocality: best-effort
reclaimPolicy: Retain
```

### Ingress & Load Balancing

With bare-metal, there's no cloud load balancer. Options:

| Option | How |
|--------|-----|
| **MetalLB** | Assigns real IPs to LoadBalancer services from a pool |
| **Traefik Ingress** (recommended) | Already familiar from MigroNet setup, runs as DaemonSet on all nodes |
| **Cloudflare Tunnel** | Already used for MigroNet local dev — expose K8s services without opening ports |

```yaml
# Traefik IngressRoute for analytics
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: analytics-web
  namespace: analytics
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`analytics.yourdomain.com`)
      kind: Rule
      services:
        - name: web
          port: 80
    - match: Host(`api.analytics.yourdomain.com`)
      kind: Rule
      services:
        - name: api-gateway
          port: 3000
  tls:
    certResolver: letsencrypt
```

### K8s Service Deployments

```yaml
# Example: api-gateway deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: analytics
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
        - name: api-gateway
          image: ghcr.io/your-org/analytics-api-gateway:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: analytics-secrets
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
          readinessProbe:
            httpGet:
              path: /health
              port: 3000

---
# HPA for auto-scaling (within node resource limits)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
  namespace: analytics
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### PostgreSQL HA on K8s

Use **CloudNativePG** operator for PostgreSQL HA:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: analytics-pg
  namespace: analytics
spec:
  instances: 2              # primary + 1 replica
  primaryUpdateStrategy: unsupervised
  storage:
    storageClass: longhorn-replicated
    size: 100Gi
  postgresql:
    parameters:
      shared_buffers: "2GB"
      effective_cache_size: "6GB"
      work_mem: "64MB"
    shared_preload_libraries:
      - timescaledb
  bootstrap:
    initdb:
      database: analytics
  backup:
    barmanObjectStore:
      destinationPath: s3://analytics-backups/  # or local NFS
      s3Credentials:
        accessKeyId:
          name: backup-creds
          key: ACCESS_KEY
        secretAccessKey:
          name: backup-creds
          key: SECRET_KEY
    retentionPolicy: "30d"
```

---

## Migration Path: Proxmox → Talos K8s

```
Phase 1 (Proxmox Docker Compose)
  │
  │  When to migrate:
  │  - > 20 active tenants, OR
  │  - Need HA (zero downtime deploys), OR
  │  - Single VM resources are exhausted
  │
  ▼
Phase 2 (Talos K8s on Mini PCs)
  │
  │  Migration steps:
  │  1. Set up Talos cluster on 3 Mini PCs (can run in parallel with Proxmox)
  │  2. Install Longhorn, Traefik, CloudNativePG, cert-manager
  │  3. Deploy all services to K8s namespace
  │  4. Migrate PostgreSQL data (pg_dump → pg_restore or streaming replication)
  │  5. DNS cutover: point analytics domain to K8s ingress
  │  6. Verify all services, connectors, and pipelines work
  │  7. Decommission Proxmox VM
  │
  │  Rollback: DNS back to Proxmox VM (keep it running for 1 week after cutover)
  │
  ▼
Phase 3 (Scale if needed)
  │
  │  - Add more Mini PCs to the cluster (Talos makes this trivial)
  │  - Or migrate to cloud K8s if geo-distributed tenants need it
```

---

## CI/CD Pipeline

### GitHub Actions: Feature Branch

```yaml
name: CI
on:
  push:
    branches: [feature/**, fix/**]
  pull_request:
    branches: [main]

jobs:
  lint-test-build:
    runs-on: self-hosted  # Proxmox-hosted runner (same as MigroNet)
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run test
      - run: bun run build

  test-pipelines:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: cd pipelines && pip install -e ".[dev]" && pytest
```

### GitHub Actions: Production Deploy

```yaml
name: Deploy Production
on:
  push:
    tags: ["v*"]

jobs:
  build-and-push:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - run: |
          for svc in api-gateway connector-service semantic-service \
                     query-engine dashboard-service tenant-service alert-service web; do
            docker build \
              -t ghcr.io/${{ github.repository_owner }}/analytics-$svc:${{ github.ref_name }} \
              -t ghcr.io/${{ github.repository_owner }}/analytics-$svc:latest \
              --build-arg SERVICE=$svc \
              -f Dockerfile .
            docker push ghcr.io/${{ github.repository_owner }}/analytics-$svc --all-tags &
          done
          wait

      - run: |
          docker build -t ghcr.io/${{ github.repository_owner }}/analytics-pipelines:${{ github.ref_name }} pipelines/
          docker push ghcr.io/${{ github.repository_owner }}/analytics-pipelines:${{ github.ref_name }}

  deploy-proxmox:
    # Phase 1: rsync to Proxmox VM + docker compose pull/up
    needs: build-and-push
    if: ${{ !vars.USE_K8S }}
    runs-on: self-hosted
    steps:
      - uses: burnett01/rsync-deployments@7
        with:
          switches: -avz --delete
          path: infra/docker/
          remote_path: ~/analytics-prod/
          remote_host: ${{ secrets.ANALYTICS_VM_HOST }}
          remote_user: ${{ secrets.DEPLOY_USER }}
          remote_key: ${{ secrets.DEPLOY_SSH_KEY }}
      - run: |
          ssh ${{ secrets.DEPLOY_USER }}@${{ secrets.ANALYTICS_VM_HOST }} \
            "cd ~/analytics-prod && docker compose pull && docker compose up -d"

  deploy-k8s:
    # Phase 2: kubectl apply to Talos cluster
    needs: build-and-push
    if: ${{ vars.USE_K8S }}
    runs-on: self-hosted
    steps:
      - uses: azure/setup-kubectl@v4
      - run: |
          kubectl set image deployment/api-gateway \
            api-gateway=ghcr.io/${{ github.repository_owner }}/analytics-api-gateway:${{ github.ref_name }} \
            -n analytics
          kubectl set image deployment/query-engine \
            query-engine=ghcr.io/${{ github.repository_owner }}/analytics-query-engine:${{ github.ref_name }} \
            -n analytics
          # ... repeat for all services
          kubectl rollout status deployment -n analytics --timeout=300s
```

---

## Observability

### Logging

All services output structured JSON logs (Pino):

```json
{
  "level": "info",
  "time": "2026-04-11T10:30:00Z",
  "service": "query-engine",
  "tenantId": "abc-123",
  "userId": "user-456",
  "msg": "Query executed",
  "queryId": "q-789",
  "durationMs": 145,
  "rowCount": 234,
  "cached": false
}
```

**Phase 1 (Proxmox)**: `docker logs` + optional Loki container in the compose stack.
**Phase 2 (K8s)**: Grafana + Loki + Prometheus stack deployed via Helm.

### Metrics (Prometheus)

| Metric | Labels | Source |
|--------|--------|--------|
| `http_request_duration_seconds` | service, method, path, status | API Gateway |
| `query_execution_duration_seconds` | tenant_id, cached | Query Engine |
| `query_cache_hit_ratio` | tenant_id | Query Engine |
| `pipeline_run_duration_seconds` | tenant_id, connector_type | Dagster |
| `pipeline_run_status_total` | status (success/failed) | Dagster |
| `active_websocket_connections` | tenant_id | API Gateway |
| `tenant_storage_bytes` | tenant_id | Platform |
| `connector_sync_rows_total` | tenant_id, connector_id | Connector Service |

### Health Checks

Every service exposes `GET /health`:

```typescript
@Get('health')
async check() {
  return this.health.check([
    () => this.db.pingCheck('database'),
    () => this.redis.pingCheck('redis'),
    () => this.nats.pingCheck('nats'),
  ]);
}
```

### Infrastructure Alerts

| Alert | Condition | Channel |
|-------|-----------|---------|
| Service down | Health check fails > 2 min | Email |
| High error rate | 5xx rate > 5% for 5 min | Slack |
| Pipeline failures | > 3 consecutive failures | Email to tenant admin |
| DB connections | Pool utilization > 80% | Slack |
| Disk usage (Proxmox) | > 85% | Email |
| Node unreachable (K8s) | Node NotReady > 5 min | Email + Slack |
| Longhorn volume degraded | Replica count < desired | Email |
