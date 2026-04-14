# 10 — Security & Authentication

## Authentication Architecture

### Multi-Provider OIDC

The platform supports multiple identity providers per tenant:

```
┌─────────────────────────────────────────────────┐
│                  Tenant Auth Config               │
│                                                  │
│  Free/Starter:  Local email/password only        │
│  Pro+:          + Azure AD, Google Workspace     │
│  Enterprise:    + Any OIDC/SAML provider         │
│                                                  │
│  Flow:                                           │
│  1. User navigates to tenant URL                 │
│  2. Platform resolves tenant                     │
│  3. Reads tenant.auth_config                     │
│  4. Redirects to configured IdP (or shows login) │
│  5. IdP returns ID token                         │
│  6. Platform validates, maps user, issues JWT    │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Local Auth (Default)

```typescript
// Bcrypt password hashing + JWT issuance
@Post('auth/login')
async login(@Body() dto: LoginDto) {
  const user = await this.authService.validateLocal(dto.email, dto.password);
  const jwt = this.jwtService.sign({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  });
  return { accessToken: jwt, expiresIn: 3600 };
}
```

### OIDC Auth (Pro+ Plans)

```typescript
// Dynamic OIDC strategy per tenant
@Get('auth/oidc/callback')
async oidcCallback(@Req() req, @Query('code') code: string) {
  const tenant = req.tenant;
  const oidcConfig = tenant.auth_config;

  // Exchange code for tokens using tenant's IdP config
  const tokens = await this.oidcService.exchangeCode(code, {
    clientId: oidcConfig.clientId,
    clientSecret: this.encryption.decrypt(oidcConfig.clientSecret),
    tokenUrl: oidcConfig.tokenUrl,
    redirectUri: `${tenant.baseUrl}/auth/oidc/callback`,
  });

  // Map external identity to tenant user
  const idToken = this.oidcService.verifyIdToken(tokens.id_token, oidcConfig);
  const user = await this.userService.findOrCreateFromOIDC(tenant.id, idToken);

  // Issue platform JWT
  const jwt = this.jwtService.sign({
    sub: user.id,
    tenantId: tenant.id,
    role: user.role,
  });

  return { accessToken: jwt };
}
```

---

## Authorization Model (RBAC)

| Role | Dashboards | Queries | Models | Sources | Users | Billing |
|------|-----------|---------|--------|---------|-------|---------|
| **Viewer** | View, filter | Run saved | View | - | - | - |
| **Explorer** | View, filter | Create, run | View | - | - | - |
| **Editor** | Create, edit | Create, run | Create, edit | View status | - | - |
| **Admin** | Full | Full | Full | Full | Full | Full |

### Resource-Level Sharing

Individual dashboards and queries can be shared:

```typescript
type SharePermission = {
  resourceType: 'dashboard' | 'query';
  resourceId: string;
  grantedTo: string;         // userId, or 'role:viewer', 'role:editor'
  permission: 'view' | 'edit';
};
```

---

## Data Security

### Credential Encryption

All connector credentials are encrypted at rest:

```typescript
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    // Phase 1: env variable
    // Phase 2+: AWS KMS / Azure Key Vault
    this.key = Buffer.from(config.getOrThrow('ENCRYPTION_KEY'), 'hex');
  }

  encrypt(plaintext: string): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  decrypt(data: Buffer): string {
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }
}
```

### Query Sandboxing

Users **never write raw SQL** against the warehouse (except opt-in raw SQL mode for Pro+).
All queries go through the semantic layer:

1. Widget requests data → sends `QueryDefinition` (metrics, dims, filters)
2. Query Engine resolves `QueryDefinition` against the `SemanticModel`
3. Query Engine generates parameterized SQL
4. SQL targets only the tenant's warehouse schema (`warehouse_{tenant_id}`)
5. PostgreSQL RLS provides defense-in-depth

```typescript
// Always enforce tenant scope
function buildWhereClause(filters: Filter[], tenantId: string): string {
  // This is non-negotiable — always present, cannot be removed by user
  const clauses = [`_tenant_schema = 'warehouse_${sanitize(tenantId)}'`];

  for (const filter of filters) {
    // Validate field exists in semantic model (whitelist)
    // Use parameterized values (never string interpolation)
    clauses.push(this.buildFilterClause(filter));
  }

  return clauses.join(' AND ');
}
```

### Raw SQL Mode (Pro+ only)

When enabled, restricted to:
- `SELECT` statements only (no DDL, DML)
- Limited to the tenant's warehouse schema
- Query timeout enforced (plan-based)
- Row count limit enforced
- Statement analysis rejects dangerous patterns

---

## API Security

| Control | Implementation |
|---------|---------------|
| Rate limiting | `@nestjs/throttler` — per tenant + per endpoint |
| Input validation | Zod schemas on all endpoints |
| SQL injection | Drizzle parameterized queries, no user SQL in query engine |
| CORS | Strict origin whitelist per tenant |
| CSRF | SameSite cookies + token |
| CSP | Strict Content-Security-Policy headers |
| Audit log | All write operations logged (userId, tenantId, action, timestamp) |
| API keys | Scoped, rotatable, rate-limited |

---

## GDPR Compliance

| Requirement | Implementation |
|-------------|---------------|
| Right to deletion | Tenant deletion cascades to all data (schema DROP) |
| Data portability | Export all tenant data via API |
| Data residency | EU-hosted infrastructure (Hetzner/Azure EU) |
| Consent tracking | Signup flow records consent |
| DPA (Data Processing Agreement) | Provided for Business+ tenants |
| Sub-processor list | Published and updated on data source additions |
| Breach notification | Incident response process documented |

---

## Secrets Management

| Environment | Strategy |
|-------------|----------|
| Development | `.env` file, Docker secrets |
| Production (Phase 1) | GitHub Actions secrets → `.env` injection |
| Production (SaaS) | AWS Secrets Manager / Vault with rotation |

### Secrets Inventory

| Secret | Used By |
|--------|---------|
| `DATABASE_URL` | All services |
| `REDIS_URL` | All services |
| `NATS_URL` | All services |
| `ENCRYPTION_KEY` | Connector Service (credential encryption) |
| `JWT_SECRET` | API Gateway |
| `DAGSTER_PG_URL` | Pipeline orchestrator |
| `STRIPE_SECRET_KEY` | Tenant Service (billing) |
| `SMTP_*` | Alert/Report Service (email delivery) |
