import {
  pgTable,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { tenants } from "./tenants.js";

export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    tenantId: varchar("tenant_id", { length: 26 })
      .notNull()
      .references(() => tenants.id),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    role: varchar("role", { length: 50 }).notNull().default("viewer"),
    authProvider: varchar("auth_provider", { length: 50 }).default("local"),
    externalId: varchar("external_id", { length: 255 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_tenant_users_tenant_email").on(table.tenantId, table.email),
    index("idx_tenant_users_tenant_id").on(table.tenantId),
    index("idx_tenant_users_email").on(table.email),
  ]
);

export const tenantUsersRelations = relations(tenantUsers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantUsers.tenantId],
    references: [tenants.id],
  }),
}));
