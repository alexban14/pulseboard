import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { tenants } from "./tenants.js";
import { tenantUsers } from "./tenant-users.js";

export const semanticModels = pgTable(
  "semantic_models",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    tenantId: varchar("tenant_id", { length: 26 })
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    version: integer("version").default(1),
    status: varchar("status", { length: 50 }).default("draft"),
    createdBy: varchar("created_by", { length: 26 }).references(() => tenantUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_semantic_models_tenant_name").on(table.tenantId, table.name),
    index("idx_semantic_models_tenant_id").on(table.tenantId),
    index("idx_semantic_models_status").on(table.status),
  ]
);

export const semanticModelsRelations = relations(
  semanticModels,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [semanticModels.tenantId],
      references: [tenants.id],
    }),
    createdByUser: one(tenantUsers, {
      fields: [semanticModels.createdBy],
      references: [tenantUsers.id],
    }),
  })
);
