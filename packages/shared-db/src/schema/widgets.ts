import {
  pgTable,
  varchar,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { dashboards } from "./dashboards.js";

export const widgets = pgTable(
  "widgets",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    dashboardId: varchar("dashboard_id", { length: 26 })
      .notNull()
      .references(() => dashboards.id),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    position: jsonb("position").notNull(),
    query: jsonb("query").notNull(),
    display: jsonb("display"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_widgets_dashboard_id").on(table.dashboardId),
  ]
);

export const widgetsRelations = relations(widgets, ({ one }) => ({
  dashboard: one(dashboards, {
    fields: [widgets.dashboardId],
    references: [dashboards.id],
  }),
}));
