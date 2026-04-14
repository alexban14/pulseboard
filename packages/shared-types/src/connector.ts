import { z } from 'zod';

export const ConnectorCategorySchema = z.enum([
  'database',
  'saas',
  'api',
  'file',
  'webhook',
]);
export type ConnectorCategory = z.infer<typeof ConnectorCategorySchema>;

export const ConnectorStatusSchema = z.enum([
  'pending',
  'healthy',
  'degraded',
  'error',
]);
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

export const SyncModeSchema = z.enum(['incremental', 'full_refresh']);
export type SyncMode = z.infer<typeof SyncModeSchema>;

export const ConnectorInstanceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  connectorTypeId: z.string(),
  name: z.string().min(1).max(255),
  status: ConnectorStatusSchema,
  syncSchedule: z.string().nullable().default(null),
  syncMode: SyncModeSchema.default('incremental'),
  lastSyncAt: z.coerce.date().nullable(),
  lastSyncRows: z.number().nullable(),
  lastSyncDurationMs: z.number().nullable(),
  nextSyncAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ConnectorInstance = z.infer<typeof ConnectorInstanceSchema>;

export const CreateConnectorInstanceSchema = z.object({
  connectorTypeId: z.string().min(1),
  name: z.string().min(1).max(255),
  config: z.record(z.unknown()),
  syncSchedule: z.string().nullable().default(null),
  syncMode: SyncModeSchema.default('incremental'),
});
export type CreateConnectorInstance = z.infer<typeof CreateConnectorInstanceSchema>;

export const DiscoveredColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean().default(false),
  isForeignKey: z.boolean().default(false),
  referencesTable: z.string().nullable().default(null),
  referencesColumn: z.string().nullable().default(null),
});
export type DiscoveredColumn = z.infer<typeof DiscoveredColumnSchema>;

export const DiscoveredTableSchema = z.object({
  name: z.string(),
  columns: z.array(DiscoveredColumnSchema),
  primaryKey: z.array(z.string()).default([]),
  estimatedRowCount: z.number().nullable().default(null),
});
export type DiscoveredTable = z.infer<typeof DiscoveredTableSchema>;

export const DiscoveredSchemaSchema = z.object({
  tables: z.array(DiscoveredTableSchema),
  discoveredAt: z.coerce.date(),
});
export type DiscoveredSchema = z.infer<typeof DiscoveredSchemaSchema>;

export const SyncRunStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const SyncRunSchema = z.object({
  id: z.string(),
  connectorInstanceId: z.string(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  status: SyncRunStatusSchema,
  rowsSynced: z.number().default(0),
  tablesSynced: z.number().default(0),
  errorMessage: z.string().nullable().default(null),
  durationMs: z.number().nullable().default(null),
});
export type SyncRun = z.infer<typeof SyncRunSchema>;
