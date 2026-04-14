import {
  pgTable,
  varchar,
  timestamp,
  integer,
  text,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { connectorInstances } from "./connector-instances.js";

export const connectorSyncRuns = pgTable(
  "connector_sync_runs",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    connectorInstanceId: varchar("connector_instance_id", { length: 26 })
      .notNull()
      .references(() => connectorInstances.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull(),
    rowsSynced: integer("rows_synced").default(0),
    tablesSynced: integer("tables_synced").default(0),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("idx_sync_runs_connector_instance_id").on(
      table.connectorInstanceId
    ),
    index("idx_sync_runs_status").on(table.status),
    index("idx_sync_runs_started_at").on(table.startedAt),
  ]
);

export const connectorSyncRunsRelations = relations(
  connectorSyncRuns,
  ({ one }) => ({
    connectorInstance: one(connectorInstances, {
      fields: [connectorSyncRuns.connectorInstanceId],
      references: [connectorInstances.id],
    }),
  })
);
