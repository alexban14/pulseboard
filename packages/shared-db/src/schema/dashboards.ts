import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { tenants } from "./tenants.js";
import { tenantUsers } from "./tenant-users.js";
import { widgets } from "./widgets.js";

export const dashboards = pgTable(
  "dashboards",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    tenantId: varchar("tenant_id", { length: 26 })
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isDefault: boolean("is_default").default(false),
    createdBy: varchar("created_by", { length: 26 }).references(() => tenantUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_dashboards_tenant_id").on(table.tenantId),
    index("idx_dashboards_created_by").on(table.createdBy),
  ]
);

export const dashboardsRelations = relations(dashboards, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [dashboards.tenantId],
    references: [tenants.id],
  }),
  createdByUser: one(tenantUsers, {
    fields: [dashboards.createdBy],
    references: [tenantUsers.id],
  }),
  widgets: many(widgets),
}));
