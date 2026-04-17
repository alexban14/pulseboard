# 16 — Data Lifecycle & Cleanup

## Overview

A multi-tenant SaaS platform must handle data cleanup at every level —
connector deletion, tenant offboarding, storage retention, and warehouse
data aging. Without proper lifecycle management:

- Orphaned warehouse tables accumulate (cost, confusion)
- Deleted tenants leave data behind (GDPR violation)
- Old exports fill storage (cost runaway)
- Free-tier tenants consume unbounded resources

This plan covers four cleanup dimensions:

```
┌──────────────────────────────────────────────────────────────┐
│                    DATA LIFECYCLE                              │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Connector Delete │  │ Tenant Delete   │                   │
│  │ (on-demand)      │  │ (on-demand)     │                   │
│  │                  │  │                 │                   │
│  │ Drop warehouse   │  │ DROP SCHEMA     │                   │
│  │ tables for this  │  │ CASCADE         │                   │
│  │ connector        │  │ Delete storage  │                   │
│  │ Delete files     │  │ prefix          │                   │
│  │ from storage     │  │ Purge all       │                   │
│  └─────────────────┘  │ platform records│                   │
│                        └─────────────────┘                   │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Storage Retention│  │ Warehouse       │                   │
│  │ (scheduled)      │  │ Retention       │                   │
│  │                  │  │ (scheduled)     │                   │
│  │ Auto-delete old  │  │ Auto-purge rows │                   │
│  │ exports past TTL │  │ past plan limit │                   │
│  │ by plan tier     │  │ by plan tier    │                   │
│  └─────────────────┘  └─────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Connector Deletion Cleanup

When a connector is deleted, the user should have the option to also clean
up the data it produced.

### Current Behavior

```
DELETE /api/connectors/:id
  → Deletes: connector_sync_runs, connector_sync_tables, connector_instances
  → Preserves: warehouse tables, stored files
```

### New Behavior

```
DELETE /api/connectors/:id?cleanup=true
  → Deletes: connector_sync_runs, connector_sync_tables, connector_instances
  → Also: DROP warehouse tables listed in connector_sync_tables
  → Also: DELETE stored_files records + files from object storage
```

### Implementation

```typescript
async delete(tenantId: string, connectorId: string, cleanup = false) {
  const connector = await this.getById(tenantId, connectorId);

  if (cleanup) {
    // 1. Get sync tables to know which warehouse tables to drop
    const syncTables = await this.getSyncTables(tenantId, connectorId);
    const schemaName = `warehouse_${tenantId.slice(0, 8).toLowerCase()}`;

    // 2. Drop each warehouse table
    for (const st of syncTables) {
      await sql`DROP TABLE IF EXISTS ${sql(schemaName)}.${sql(st.warehouseTable)}`;
    }

    // 3. Delete stored files from object storage
    const files = await db.select().from(storedFiles)
      .where(eq(storedFiles.connectorId, connectorId));

    for (const file of files) {
      await storage.delete(file.key);
    }
    await db.delete(storedFiles)
      .where(eq(storedFiles.connectorId, connectorId));
  }

  // 4. Delete platform records (existing behavior)
  await db.delete(connectorSyncRuns)
    .where(eq(connectorSyncRuns.connectorInstanceId, connectorId));
  await db.delete(connectorSyncTables)
    .where(eq(connectorSyncTables.connectorInstanceId, connectorId));
  await db.delete(connectorInstances)
    .where(and(
      eq(connectorInstances.id, connectorId),
      eq(connectorInstances.tenantId, tenantId),
    ));
}
```

### Frontend UX

Delete confirmation dialog with a checkbox:

```
┌──────────────────────────────────────────────┐
│  Delete "MigroNet DB DEV"?                   │
│                                              │
│  This will permanently delete this data      │
│  source configuration.                       │
│                                              │
│  ☐ Also delete warehouse data (81 tables,    │
│    ~9M rows) and uploaded files              │
│                                              │
│  [Cancel]  [Delete]                          │
└──────────────────────────────────────────────┘
```

---

## 2. Tenant Deletion Cascade

When a tenant is deleted (or cancelled after grace period), ALL tenant data
must be purged for GDPR compliance.

### Cascade Order

```
1. Suspend tenant (status = 'suspended', grace period starts)
   └→ All API access returns 403
   └→ Pipeline schedules paused
   └→ Data preserved for grace period (30 days)

2. After grace period (or immediate if admin-triggered):

   a. Delete stored files from object storage
      └→ storage.list('tenants/{tenant_id}/')
      └→ storage.delete(each key)

   b. Drop warehouse schema
      └→ DROP SCHEMA warehouse_{tenant_id_prefix} CASCADE

   c. Delete all platform records (reverse FK order):
      └→ stored_files WHERE tenant_id = ?
      └→ widgets WHERE dashboard_id IN (dashboards for tenant)
      └→ dashboards WHERE tenant_id = ?
      └→ semantic_models WHERE tenant_id = ?
      └→ connector_sync_runs WHERE connector_instance_id IN (...)
      └→ connector_sync_tables WHERE connector_instance_id IN (...)
      └→ connector_instances WHERE tenant_id = ?
      └→ tenant_users WHERE tenant_id = ?
      └→ nlq_queries WHERE tenant_id = ? (future)
      └→ nlq_usage WHERE tenant_id = ? (future)
      └→ tenants WHERE id = ? (soft delete → hard delete)

   d. Purge Dagster run records tagged with tenant_id
      └→ Via Dagster GraphQL API or direct DB cleanup

3. Emit TenantDeleted event via NATS
   └→ Any service listening can clean up its own state
```

### Implementation: TenantCleanupService

```typescript
@Injectable()
export class TenantCleanupService {
  async deleteTenant(tenantId: string, immediate = false) {
    if (!immediate) {
      // Soft-delete: set status to 'suspended', schedule hard delete
      await this.db.update(tenants)
        .set({ status: 'suspended', deletedAt: new Date() })
        .where(eq(tenants.id, tenantId));
      return;
    }

    // Hard delete: cascade everything
    const schemaName = `warehouse_${tenantId.slice(0, 8).toLowerCase()}`;

    // 1. Storage cleanup
    const files = await this.storage.list(`tenants/${tenantId}/`);
    for (const file of files) {
      await this.storage.delete(file.key);
    }

    // 2. Drop warehouse schema
    await sql`DROP SCHEMA IF EXISTS ${sql(schemaName)} CASCADE`;

    // 3. Delete platform records (order matters for FK constraints)
    // ... cascade delete all tenant-owned records ...

    // 4. Hard delete tenant
    await this.db.delete(tenants).where(eq(tenants.id, tenantId));
  }
}
```

### Scheduled Cleanup Sensor (Dagster)

A Dagster sensor runs daily to check for tenants past their grace period:

```python
@sensor(minimum_interval_seconds=86400)  # daily
def tenant_cleanup_sensor(context):
    """Find suspended tenants past 30-day grace period and trigger deletion."""
    expired = platform_db.get_expired_tenants(grace_days=30)
    for tenant in expired:
        yield RunRequest(
            run_key=f"cleanup-{tenant['id']}",
            run_config={"ops": {"cleanup_tenant": {"config": {"tenant_id": tenant["id"]}}}},
        )
```

---

## 3. Storage Retention Policies

Exported files (Excel/CSV/PDF reports) should be auto-deleted after a
configurable period based on the tenant's plan.

### Retention by Plan

| Plan | Upload Retention | Export Retention |
|------|-----------------|-----------------|
| Free | 30 days | 7 days |
| Starter | 1 year | 30 days |
| Pro | 3 years | 90 days |
| Business | 5 years | 1 year |
| Enterprise | Custom | Custom |

### Implementation

Dagster sensor runs daily:

```python
@sensor(minimum_interval_seconds=86400)
def storage_retention_sensor(context):
    """Delete stored files past their retention period."""
    expired_files = platform_db.get_expired_files()
    # Returns files WHERE:
    #   purpose = 'export' AND created_at < (now - plan_export_retention)
    #   OR purpose = 'upload' AND created_at < (now - plan_upload_retention)

    for file in expired_files:
        storage.delete(file['key'])
        platform_db.delete_stored_file(file['id'])

    context.log.info(f"Cleaned up {len(expired_files)} expired files")
```

### Database Query

```sql
-- Get files past retention
SELECT sf.id, sf.key, sf.purpose, sf.created_at, t.plan
FROM stored_files sf
JOIN tenants t ON sf.tenant_id = t.id
WHERE
  (sf.purpose = 'export' AND sf.created_at < NOW() - (
    CASE t.plan
      WHEN 'free' THEN INTERVAL '7 days'
      WHEN 'starter' THEN INTERVAL '30 days'
      WHEN 'pro' THEN INTERVAL '90 days'
      WHEN 'business' THEN INTERVAL '1 year'
      ELSE INTERVAL '100 years'  -- enterprise: no auto-delete
    END
  ))
  OR
  (sf.purpose = 'upload' AND sf.created_at < NOW() - (
    CASE t.plan
      WHEN 'free' THEN INTERVAL '30 days'
      WHEN 'starter' THEN INTERVAL '1 year'
      WHEN 'pro' THEN INTERVAL '3 years'
      WHEN 'business' THEN INTERVAL '5 years'
      ELSE INTERVAL '100 years'
    END
  ));
```

---

## 4. Warehouse Data Retention

Raw warehouse data should be purged based on the tenant's plan to control
storage costs.

### Retention by Plan

| Plan | Warehouse Data Retention |
|------|------------------------|
| Free | 30 days |
| Starter | 1 year |
| Pro | 3 years |
| Business | 5 years |
| Enterprise | Custom (unlimited default) |

### Implementation

Dagster sensor runs weekly:

```python
@sensor(minimum_interval_seconds=604800)  # weekly
def warehouse_retention_sensor(context):
    """Delete warehouse rows past their retention period."""
    tenants = platform_db.get_all_active_tenants()

    retention_days = {
        'free': 30,
        'starter': 365,
        'pro': 1095,
        'business': 1825,
        'enterprise': 36500,  # ~100 years
    }

    for tenant in tenants:
        days = retention_days.get(tenant['plan'], 36500)
        schema = f"warehouse_{tenant['id'][:8].lower()}"

        # Get all tables in this tenant's warehouse
        tables = warehouse_db.list_tables(schema)

        for table in tables:
            # Delete rows where _pb_synced_at is past retention
            deleted = warehouse_db.execute(f"""
                DELETE FROM {schema}.{table}
                WHERE _pb_synced_at < NOW() - INTERVAL '{days} days'
            """)
            if deleted > 0:
                context.log.info(
                    f"Purged {deleted} rows from {schema}.{table} "
                    f"(tenant {tenant['id']}, plan {tenant['plan']})"
                )
```

### Safety Measures

- **Never delete from enterprise tenants** without explicit config
- **Log all deletions** with row counts for audit
- **Dry-run mode**: configurable env var to log what would be deleted without
  actually deleting (for initial rollout validation)
- **Exclude recently synced data**: never delete rows synced in the last 24 hours
  regardless of retention policy (prevents race with in-progress syncs)

---

## API Endpoints

```
DELETE /api/connectors/:id?cleanup=true|false
  → Existing endpoint, add cleanup query param

DELETE /api/admin/tenants/:id?immediate=true|false
  → Super-admin only: hard-delete tenant with cascade

GET /api/admin/retention/preview
  → Preview: what would be cleaned up (dry run)

POST /api/admin/retention/run
  → Manually trigger retention cleanup
```

---

## Implementation Phases

| Task | Phase | Priority |
|------|-------|----------|
| 1.27 Connector deletion with cleanup option | Phase 1 | P1 |
| 1.28 Tenant deletion cascade | Phase 3 (multi-tenant) | P0 |
| 1.29 Storage retention policies | Phase 3 | P1 |
| 1.30 Warehouse data retention | Phase 3 | P1 |

Tasks 1.29 and 1.30 depend on plan gating (Phase 3) to know each tenant's
retention limits. Task 1.27 can be done now. Task 1.28 is critical for
GDPR compliance before SaaS launch.

---

## Security & Compliance

| Concern | Mitigation |
|---------|------------|
| **Accidental deletion** | Confirmation dialog with cleanup checkbox. Soft-delete with 30-day grace period for tenants. |
| **GDPR right to deletion** | Tenant cascade deletes ALL data including warehouse, storage, and platform records. No data retained after grace period. |
| **Audit trail** | All deletions logged with tenant_id, user_id, timestamp, what was deleted. Logs retained separately from tenant data. |
| **Race condition with syncs** | Never delete warehouse rows synced in last 24h. Check for running sync before connector deletion. |
| **Cost visibility** | Storage usage per tenant visible in admin dashboard. Alerts when tenant approaches plan limits. |
