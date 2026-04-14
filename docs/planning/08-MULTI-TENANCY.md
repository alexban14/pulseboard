# 08 — Multi-Tenancy Strategy

## Tenancy Model: Schema-per-Tenant (Hybrid)

For an analytics platform, data isolation is paramount — tenants will be
connecting their production databases. We use a **hybrid approach**:

| Layer | Isolation Method |
|-------|-----------------|
| **Platform tables** (tenants, users, connectors, models, dashboards) | Row-level with `tenant_id` + PostgreSQL RLS |
| **Warehouse data** (raw tables, aggregations) | Schema-per-tenant (`warehouse_{tenant_id}`) |
| **Cache** (Redis) | Key prefix per tenant |
| **Pipeline execution** (Dagster) | Run tags + tenant context per job |

This gives us:
- **Strong data isolation** for the warehouse (schema-level, not just row-level)
- **Simpler management** for platform tables (single schema, RLS-protected)
- **Easy cleanup** on tenant deletion (DROP SCHEMA CASCADE)
- **Per-tenant performance tuning** possible (separate tablespaces if needed)

---

## Tenant Lifecycle

### Signup Flow

```
1. User visits landing page → clicks "Start Free"
   └→ Collects: email, password (or SSO), company name

2. TenantCreated event fires
   ├→ Create tenant record in platform DB
   ├→ Create warehouse schema: CREATE SCHEMA warehouse_{id}
   ├→ Create first user with Admin role
   ├→ Send welcome email
   └→ Redirect to onboarding wizard

3. Onboarding Wizard (step-by-step)
   ├→ Step 1: "Connect your first data source"
   │   └→ Select connector type, enter credentials, test connection
   ├→ Step 2: "Select tables to sync"
   │   └→ Schema discovery results shown, user picks tables
   ├→ Step 3: "First sync" (runs in background)
   │   └→ Progress bar, estimated time, "we'll email you when done"
   ├→ Step 4: "Create your first model" (optional, can skip)
   │   └→ Visual model builder with suggested metrics/dims
   └→ Step 5: "Your first dashboard"
       └→ Auto-generated dashboard from model, or blank canvas
```

### Suspension & Deletion

```
Tenant Suspended (non-payment, abuse):
  ├→ All API access returns 403
  ├→ Pipeline schedules paused
  ├→ Data preserved for grace period (30 days)
  └→ Admin notified via email

Tenant Deleted:
  ├→ Soft-delete tenant record (retained for 30 days)
  ├→ DROP SCHEMA warehouse_{id} CASCADE
  ├→ Delete Redis cache keys with tenant prefix
  ├→ Purge encrypted connector configs
  ├→ Remove Dagster pipeline configs
  └→ GDPR: confirm no PII retained after 30-day window
```

---

## Tenant Data Model

```sql
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',
    status          VARCHAR(50) NOT NULL DEFAULT 'active',
    settings        JSONB DEFAULT '{}',
    branding        JSONB DEFAULT '{}',            -- {logo, primaryColor, favicon}
    custom_domain   VARCHAR(255),
    auth_config     JSONB DEFAULT '{}',            -- {provider, clientId, issuer, ...}
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ                    -- soft delete
);

CREATE TABLE tenant_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    email           VARCHAR(255) NOT NULL,
    name            VARCHAR(255),
    role            VARCHAR(50) NOT NULL DEFAULT 'viewer',
    auth_provider   VARCHAR(50) DEFAULT 'local',
    external_id     VARCHAR(255),
    password_hash   VARCHAR(255),                  -- only for local auth
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, email)
);

-- RLS on platform tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connector_instances
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
-- ... same for all tenant-scoped tables
```

---

## Tenant Resolution

```typescript
@Injectable()
export class TenantResolver {
  constructor(private readonly tenantRepo: TenantRepository) {}

  async resolve(req: Request): Promise<Tenant> {
    // 1. Custom domain: analytics.acme.com → lookup
    const host = req.headers['host'];
    let tenant = await this.tenantRepo.findByDomain(host);
    if (tenant) return tenant;

    // 2. Subdomain: acme.analyticsplatform.com → extract "acme"
    const slug = this.extractSubdomain(host);
    if (slug) {
      tenant = await this.tenantRepo.findBySlug(slug);
      if (tenant) return tenant;
    }

    // 3. API header (service-to-service)
    const headerId = req.headers['x-tenant-id'] as string;
    if (headerId) {
      tenant = await this.tenantRepo.findById(headerId);
      if (tenant) return tenant;
    }

    // 4. JWT claim
    const tokenTenantId = (req as any).user?.tenantId;
    if (tokenTenantId) {
      return this.tenantRepo.findById(tokenTenantId);
    }

    throw new UnauthorizedException('Unable to resolve tenant');
  }
}
```

---

## Plan Limits & Feature Gating

```typescript
// packages/shared-auth/src/plan-guard.ts

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free:       { dataSources: 1,  users: 3,   dashboards: 2,   refreshMinutes: 60,  models: 1,  alerts: 0,   reports: 0  },
  starter:    { dataSources: 3,  users: 10,  dashboards: 10,  refreshMinutes: 15,  models: 3,  alerts: 5,   reports: 5  },
  pro:        { dataSources: 10, users: 50,  dashboards: -1,  refreshMinutes: 5,   models: 10, alerts: 50,  reports: 25 },
  business:   { dataSources: 25, users: 200, dashboards: -1,  refreshMinutes: 1,   models: -1, alerts: -1,  reports: -1 },
  enterprise: { dataSources: -1, users: -1,  dashboards: -1,  refreshMinutes: 0.5, models: -1, alerts: -1,  reports: -1 },
};  // -1 = unlimited

@Injectable()
export class PlanGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const tenant = context.switchToHttp().getRequest().tenant;
    const limits = PLAN_LIMITS[tenant.plan];
    const resource = Reflector.get('plan_resource', context.getHandler());

    const currentCount = this.countResource(tenant.id, resource);
    const limit = limits[resource];

    if (limit !== -1 && currentCount >= limit) {
      throw new ForbiddenException(
        `Plan limit reached: ${resource} (${currentCount}/${limit}). Upgrade to add more.`
      );
    }

    return true;
  }
}

// Usage in controller:
@Post()
@PlanResource('dataSources')
async createConnector(@Body() dto: CreateConnectorDto) { ... }
```

---

## Feature Matrix

| Feature | Free | Starter | Pro | Business | Enterprise |
|---------|------|---------|-----|----------|------------|
| Data sources | 1 | 3 | 10 | 25 | Unlimited |
| Users | 3 | 10 | 50 | 200 | Unlimited |
| Dashboards | 2 | 10 | Unlimited | Unlimited | Unlimited |
| Semantic models | 1 | 3 | 10 | Unlimited | Unlimited |
| Refresh frequency | 1 hour | 15 min | 5 min | 1 min | 30 sec |
| Data retention | 30 days | 1 year | 3 years | 5 years | Custom |
| Visual query builder | Yes | Yes | Yes | Yes | Yes |
| Raw SQL mode | No | No | Yes | Yes | Yes |
| Scheduled reports | No | 5 | 25 | Unlimited | Unlimited |
| Alerting rules | No | 5 | 50 | Unlimited | Unlimited |
| Custom domain | No | No | Yes | Yes | Yes |
| White-label branding | No | No | No | Yes | Yes |
| Embeddable dashboards | No | No | No | Yes | Yes |
| SSO (OIDC) | No | No | Yes | Yes | Yes |
| API access | No | Read | Full | Full | Full |
| Schema isolation | Schema | Schema | Schema | Schema | Schema + DB option |
| Priority support | No | No | Yes | Yes | Dedicated + SLA |
| Connector marketplace | Built-in | Built-in | + Premium | + Premium | + Custom |
