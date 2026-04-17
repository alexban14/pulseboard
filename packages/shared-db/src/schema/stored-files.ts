import {
  pgTable,
  varchar,
  text,
  bigint,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { tenants } from "./tenants.js";
import { tenantUsers } from "./tenant-users.js";
import { connectorInstances } from "./connector-instances.js";

export const storedFiles = pgTable(
  "stored_files",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    tenantId: varchar("tenant_id", { length: 26 })
      .notNull()
      .references(() => tenants.id),
    key: text("key").notNull().unique(),
    originalName: varchar("original_name", { length: 500 }).notNull(),
    contentType: varchar("content_type", { length: 255 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageProvider: varchar("storage_provider", { length: 50 }).notNull(),
    purpose: varchar("purpose", { length: 50 }).notNull(),
    connectorId: varchar("connector_id", { length: 26 }).references(
      () => connectorInstances.id,
    ),
    uploadedBy: varchar("uploaded_by", { length: 26 }).references(
      () => tenantUsers.id,
    ),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_stored_files_tenant").on(table.tenantId),
    index("idx_stored_files_connector").on(table.connectorId),
    index("idx_stored_files_purpose").on(table.purpose),
  ],
);

export const storedFilesRelations = relations(storedFiles, ({ one }) => ({
  tenant: one(tenants, {
    fields: [storedFiles.tenantId],
    references: [tenants.id],
  }),
  connector: one(connectorInstances, {
    fields: [storedFiles.connectorId],
    references: [connectorInstances.id],
  }),
  uploader: one(tenantUsers, {
    fields: [storedFiles.uploadedBy],
    references: [tenantUsers.id],
  }),
}));
