import { pgTable, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { tenantUsers } from "./tenant-users.js";
import { connectorInstances } from "./connector-instances.js";
import { dashboards } from "./dashboards.js";
import { semanticModels } from "./semantic-models.js";

export const tenants = pgTable(
  "tenants",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).unique().notNull(),
    plan: varchar("plan", { length: 50 }).notNull().default("free"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    settings: jsonb("settings").default({}),
    branding: jsonb("branding").default({}),
    customDomain: varchar("custom_domain", { length: 255 }),
    authConfig: jsonb("auth_config").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_tenants_slug").on(table.slug),
    index("idx_tenants_status").on(table.status),
  ]
);

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(tenantUsers),
  connectorInstances: many(connectorInstances),
  dashboards: many(dashboards),
  semanticModels: many(semanticModels),
}));
