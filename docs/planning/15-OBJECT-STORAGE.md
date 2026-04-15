# 15 — Object Storage

## Overview

Pulseboard needs persistent file storage for:

1. **Uploaded files** — CSV/Excel uploads preserved for re-processing, audit trail
2. **Exported reports** — generated Excel/CSV/PDF files for download
3. **Dashboard exports** — PDF/PNG snapshots of dashboards
4. **Pipeline artifacts** — intermediate ETL outputs, error samples
5. **Tenant assets** — logos, favicons (white-label branding)

The storage layer uses a **driver-based architecture** (Interface + Factory)
so providers can be swapped without changing application code.

## Supported Providers

| Provider | Use Case | S3-Compatible |
|----------|----------|---------------|
| **MinIO** | Self-hosted (Proxmox/K8s), dev environment | Yes |
| **AWS S3** | Cloud production, enterprise tenants | Yes (native) |
| **Backblaze B2** | Cheapest cloud storage ($0.005/GB) | Yes |
| **Azure Blob** | Existing Azure investment (MigroNet uses it) | Via gateway |
| **Local Filesystem** | Development fallback, single-server setups | No |

**Key insight:** MinIO, S3, and Backblaze B2 all speak the **S3 API**. We only
need two real driver implementations:
1. **S3-Compatible** — covers MinIO, AWS S3, and Backblaze B2 via endpoint config
2. **Azure Blob** — separate SDK, different API
3. **Local Filesystem** — development/fallback

---

## Architecture

### Interface + Factory Pattern

```typescript
// packages/shared-storage/src/storage.interface.ts

interface StorageProvider {
  readonly name: string;

  /** Upload a file, return a storage key */
  upload(params: UploadParams): Promise<StorageObject>;

  /** Download a file by key */
  download(key: string): Promise<Buffer>;

  /** Get a time-limited signed URL for direct browser download */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /** Delete a file */
  delete(key: string): Promise<void>;

  /** Check if a file exists */
  exists(key: string): Promise<boolean>;

  /** List files with optional prefix filter */
  list(prefix?: string, limit?: number): Promise<StorageObject[]>;

  /** Health check */
  healthCheck(): Promise<boolean>;
}

interface UploadParams {
  key: string;           // storage path: "tenants/{id}/uploads/{filename}"
  body: Buffer | ReadableStream;
  contentType: string;
  metadata?: Record<string, string>;  // custom metadata (tenant_id, uploader, etc.)
}

interface StorageObject {
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  metadata?: Record<string, string>;
  etag?: string;
}
```

### Factory

```typescript
// packages/shared-storage/src/storage.factory.ts

class StorageFactory {
  static create(config: StorageConfig): StorageProvider {
    switch (config.provider) {
      case 's3':
      case 'minio':
      case 'backblaze':
        return new S3CompatibleProvider(config);
      case 'azure':
        return new AzureBlobProvider(config);
      case 'local':
        return new LocalFileSystemProvider(config);
      default:
        throw new Error(`Unsupported storage provider: ${config.provider}`);
    }
  }
}
```

### Configuration

```typescript
interface StorageConfig {
  provider: 's3' | 'minio' | 'backblaze' | 'azure' | 'local';
  bucket: string;                    // bucket name or container name

  // S3-compatible (MinIO, S3, Backblaze B2)
  endpoint?: string;                 // MinIO: "http://minio:9000", B2: "s3.us-west-000.backblazeb2.com"
  region?: string;                   // "us-east-1", "eu-west-1"
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;          // true for MinIO (bucket in path, not subdomain)

  // Azure Blob
  connectionString?: string;
  accountName?: string;
  accountKey?: string;

  // Local filesystem
  basePath?: string;                 // "/data/storage"
}
```

### Environment Variables

```
# .env
STORAGE_PROVIDER=minio              # minio | s3 | backblaze | azure | local
STORAGE_BUCKET=pulseboard
STORAGE_ENDPOINT=http://minio:9000  # for MinIO/B2
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true       # true for MinIO
```

---

## Provider Implementations

### 1. S3-Compatible (MinIO, AWS S3, Backblaze B2)

Uses the `@aws-sdk/client-s3` package — works with any S3-compatible API.

```typescript
class S3CompatibleProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,                    // MinIO: http://minio:9000
      region: config.region ?? 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!,
      },
      forcePathStyle: config.forcePathStyle ?? false, // true for MinIO
    });
  }

  async upload(params: UploadParams): Promise<StorageObject> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    }));
    // ... return StorageObject
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }), { expiresIn });
  }
}
```

**Provider-specific config:**

| Provider | endpoint | region | forcePathStyle |
|----------|----------|--------|---------------|
| MinIO | `http://minio:9000` | `us-east-1` (any) | `true` |
| AWS S3 | (default) | `eu-west-1` | `false` |
| Backblaze B2 | `https://s3.{region}.backblazeb2.com` | `us-west-000` | `false` |

### 2. Azure Blob Storage

Uses `@azure/storage-blob` SDK.

```typescript
class AzureBlobProvider implements StorageProvider {
  private containerClient: ContainerClient;

  constructor(config: StorageConfig) {
    const blobService = BlobServiceClient.fromConnectionString(
      config.connectionString!,
    );
    this.containerClient = blobService.getContainerClient(config.bucket);
  }

  async upload(params: UploadParams): Promise<StorageObject> {
    const blockBlob = this.containerClient.getBlockBlobClient(params.key);
    await blockBlob.upload(params.body, params.body.length, {
      blobHTTPHeaders: { blobContentType: params.contentType },
      metadata: params.metadata,
    });
    // ... return StorageObject
  }
}
```

### 3. Local Filesystem (Development)

Falls back to disk. No external dependencies.

```typescript
class LocalFileSystemProvider implements StorageProvider {
  private basePath: string;

  constructor(config: StorageConfig) {
    this.basePath = config.basePath ?? '/data/storage';
  }

  async upload(params: UploadParams): Promise<StorageObject> {
    const fullPath = path.join(this.basePath, params.key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.body);
    // ... return StorageObject
  }

  async getSignedUrl(key: string): Promise<string> {
    // For local dev: return a direct API route
    return `/api/storage/download/${encodeURIComponent(key)}`;
  }
}
```

---

## Storage Key Convention

All files use a structured key format:

```
tenants/{tenant_id}/uploads/{connector_id}/{filename}_{timestamp}.{ext}
tenants/{tenant_id}/exports/{export_type}/{filename}_{timestamp}.{ext}
tenants/{tenant_id}/assets/{type}/{filename}.{ext}
platform/backups/{date}/{filename}
```

Examples:
```
tenants/01KP80P9/uploads/01KP8C7C/kpi_dashboard_1713189608.xlsx
tenants/01KP80P9/exports/excel/revenue_report_1713189700.xlsx
tenants/01KP80P9/assets/logo/logo.png
```

---

## Database Schema Additions

```sql
-- Track stored files for audit, download, and cleanup
CREATE TABLE stored_files (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id),
    key             TEXT NOT NULL UNIQUE,        -- storage key
    original_name   VARCHAR(500) NOT NULL,       -- user's filename
    content_type    VARCHAR(255) NOT NULL,
    size_bytes      BIGINT NOT NULL,
    storage_provider VARCHAR(50) NOT NULL,       -- which provider stored it
    purpose         VARCHAR(50) NOT NULL,        -- upload, export, asset
    connector_id    VARCHAR(26) REFERENCES connector_instances(id),
    uploaded_by     VARCHAR(26) REFERENCES tenant_users(id),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stored_files_tenant ON stored_files(tenant_id);
CREATE INDEX idx_stored_files_connector ON stored_files(connector_id);
CREATE INDEX idx_stored_files_purpose ON stored_files(purpose);
```

---

## Docker Compose — MinIO Service

```yaml
# Dev environment — MinIO as S3-compatible object storage
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  ports:
    - "${MINIO_API_PORT:-9040}:9000"        # S3 API
    - "${MINIO_CONSOLE_PORT:-9041}:9001"    # Web console
  environment:
    MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
    MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
  volumes:
    - minio_data_dev:/data
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]
    interval: 10s
    timeout: 5s
    retries: 3
```

Port pattern: `9040` (API), `9041` (console).

MinIO console at `http://localhost:9041` — visual file browser, bucket management.

---

## Integration Points

### 1. CSV/Excel Upload (Phase 1)

Current flow: parse → insert into PG → discard file.
New flow: parse → **save to storage** → insert into PG → record in stored_files.

```typescript
// In upload.service.ts
const storageKey = `tenants/${tenantId}/uploads/${connectorId}/${filename}_${Date.now()}.${ext}`;
await this.storage.upload({
  key: storageKey,
  body: file.buffer,
  contentType: file.mimetype,
  metadata: { tenant_id: tenantId, connector_id: connectorId },
});

// Record in DB
await this.db.insert(storedFiles).values({
  tenantId,
  key: storageKey,
  originalName: file.originalname,
  contentType: file.mimetype,
  sizeBytes: file.size,
  storageProvider: this.storage.name,
  purpose: 'upload',
  connectorId,
  uploadedBy: userId,
});
```

### 2. Report Export (Phase 2)

Dashboard/query exports saved to storage with signed URL for download.

### 3. Dashboard PDF Export (Phase 5)

Rendered PDFs saved to storage.

### 4. Tenant Assets / White-Label (Phase 3+)

Logos, favicons uploaded by tenant admins.

---

## Package Structure

```
packages/
  shared-storage/
    src/
      storage.interface.ts      # StorageProvider interface
      storage.factory.ts        # Factory: create provider from config
      storage.module.ts         # NestJS module (Global)
      providers/
        s3-compatible.ts        # MinIO, AWS S3, Backblaze B2
        azure-blob.ts           # Azure Blob Storage
        local-filesystem.ts     # Local disk fallback
    package.json
    tsconfig.json
```

This is a **shared package** (like shared-db, shared-types) consumed by the
api-gateway and any future service that needs file storage.

---

## Tenant Configuration

Enterprise tenants can bring their own storage:

```json
// tenant.settings.storage
{
  "provider": "s3",
  "bucket": "acme-analytics",
  "region": "eu-west-1",
  "accessKeyId": "encrypted...",
  "secretAccessKey": "encrypted..."
}
```

If not configured, the platform's default storage is used.

---

## Implementation Phases

### Phase 1 Patch (Now)

| # | Task |
|---|------|
| 1 | Create `@pulseboard/shared-storage` package with interface + factory |
| 2 | Implement S3-compatible provider (covers MinIO/S3/B2) |
| 3 | Implement local filesystem provider (dev fallback) |
| 4 | Add MinIO to docker-compose.dev.yml |
| 5 | Wire storage into CSV upload (save file + record in DB) |
| 6 | Add `stored_files` table to Drizzle schema |
| 7 | API endpoint: GET /storage/:key — download via signed URL |

### Phase 2 (Reports)

| # | Task |
|---|------|
| 8 | Report exports saved to storage |
| 9 | Download link with signed URL (time-limited) |

### Phase 3 (Multi-Tenant)

| # | Task |
|---|------|
| 10 | Per-tenant storage configuration |
| 11 | Azure Blob provider |
| 12 | Tenant assets (logo, favicon) upload |

### Phase 5 (Growth)

| # | Task |
|---|------|
| 13 | Storage usage tracking per tenant |
| 14 | Retention policies (auto-delete old exports) |
| 15 | Backblaze B2 cost optimization for archival |

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| **Large file uploads (>50MB)** | Stream directly to storage, don't buffer in memory. Use multipart upload for S3. |
| **Signed URL latency** | Cache signed URLs in Redis (TTL = URL expiry - 60s buffer) |
| **Storage costs at scale** | Backblaze B2 ($0.005/GB) for exports/archives. MinIO for self-hosted. S3 lifecycle rules for tiered storage. |
| **Cross-region latency** | Store in same region as compute. CDN (Cloudflare R2) for tenant assets. |
| **Provider lock-in** | Interface + Factory pattern. All code uses `StorageProvider` — never raw S3/Azure SDK. |

---

## Security

| Concern | Mitigation |
|---------|------------|
| **Tenant data isolation** | Storage keys are prefixed with `tenants/{tenant_id}/`. No cross-tenant path access. |
| **Signed URL leakage** | URLs expire (default 1 hour). Logged in stored_files. |
| **Credential storage** | Provider credentials encrypted (same AES-256-GCM as connector configs). |
| **File type validation** | Whitelist allowed extensions and MIME types per upload context. |
| **Size limits** | Configurable per plan. Free: 100MB total, Pro: 10GB, Enterprise: unlimited. |

---

## ADR

### D21: S3-Compatible as Universal Storage Protocol

**Date:** 2026-04-15
**Status:** Proposed

**Decision:** Use the S3 API as the primary storage protocol. MinIO for
self-hosted, Backblaze B2 for cheap cloud, AWS S3 for enterprise.
Azure Blob as a separate driver for existing Azure customers.

**Rationale:** S3 is the de facto standard. MinIO, B2, R2 (Cloudflare),
GCS (Google), and DigitalOcean Spaces all speak S3. One driver covers 5+
providers. Only Azure needs a separate implementation.

**Alternatives rejected:**
- Azure-first (MigroNet uses it, but locks out non-Azure tenants)
- Local filesystem only (doesn't scale, no signed URLs)
- Each provider as separate driver (unnecessary — S3 covers most)
