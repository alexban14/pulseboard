import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { tenants } from "./tenants.js";
import { connectorSyncTables } from "./connector-sync-tables.js";
import { connectorSyncRuns } from "./connector-sync-runs.js";

export const connectorInstances = pgTable(
  "connector_instances",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    tenantId: varchar("tenant_id", { length: 26 })
      .notNull()
      .references(() => tenants.id),
    connectorTypeId: varchar("connector_type_id", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    config: text("config").notNull(),
    status: varchar("status", { length: 50 }).default("pending"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestError: text("last_test_error"),
    syncSchedule: varchar("sync_schedule", { length: 100 }),
    syncMode: varchar("sync_mode", { length: 50 }).default("incremental"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncRows: integer("last_sync_rows"),
    lastSyncDurationMs: integer("last_sync_duration_ms"),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_connector_instances_tenant_name").on(
      table.tenantId,
      table.name
    ),
    index("idx_connector_instances_tenant_id").on(table.tenantId),
    index("idx_connector_instances_status").on(table.status),
    index("idx_connector_instances_next_sync").on(table.nextSyncAt),
  ]
);

export const connectorInstancesRelations = relations(
  connectorInstances,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [connectorInstances.tenantId],
      references: [tenants.id],
    }),
    syncTables: many(connectorSyncTables),
    syncRuns: many(connectorSyncRuns),
  })
);
