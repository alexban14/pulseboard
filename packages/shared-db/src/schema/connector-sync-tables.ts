import {
  pgTable,
  varchar,
  boolean,
  text,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { newId } from "../ulid.js";
import { connectorInstances } from "./connector-instances.js";

export const connectorSyncTables = pgTable(
  "connector_sync_tables",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(newId),
    connectorInstanceId: varchar("connector_instance_id", { length: 26 })
      .notNull()
      .references(() => connectorInstances.id),
    sourceTable: varchar("source_table", { length: 255 }).notNull(),
    warehouseTable: varchar("warehouse_table", { length: 255 }).notNull(),
    syncEnabled: boolean("sync_enabled").default(true),
    incrementalColumn: varchar("incremental_column", { length: 255 }),
    lastSyncValue: text("last_sync_value"),
  },
  (table) => [
    unique("uq_sync_tables_instance_source").on(
      table.connectorInstanceId,
      table.sourceTable
    ),
    index("idx_sync_tables_connector_instance_id").on(
      table.connectorInstanceId
    ),
  ]
);

export const connectorSyncTablesRelations = relations(
  connectorSyncTables,
  ({ one }) => ({
    connectorInstance: one(connectorInstances, {
      fields: [connectorSyncTables.connectorInstanceId],
      references: [connectorInstances.id],
    }),
  })
);
