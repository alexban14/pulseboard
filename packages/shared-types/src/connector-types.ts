import { z } from 'zod';

/**
 * Connector type definition — describes a category of data source
 * (e.g., "MySQL Database", "PostgreSQL Database", "REST API").
 *
 * Each connector type has a config schema (JSON Schema) that defines
 * what fields the user fills in when connecting (host, port, credentials, etc.).
 */

export const ConnectorCapabilitiesSchema = z.object({
  schemaDiscovery: z.boolean(),
  incrementalSync: z.boolean(),
  fullRefresh: z.boolean(),
  webhookIngestion: z.boolean(),
});
export type ConnectorCapabilities = z.infer<typeof ConnectorCapabilitiesSchema>;

export const ConnectorTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['database', 'saas', 'api', 'file', 'webhook']),
  icon: z.string(),
  description: z.string(),
  configFields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      type: z.enum(['text', 'number', 'password', 'boolean', 'select', 'textarea']),
      required: z.boolean().default(true),
      default: z.unknown().optional(),
      placeholder: z.string().optional(),
      options: z
        .array(z.object({ label: z.string(), value: z.string() }))
        .optional(),
      helpText: z.string().optional(),
    }),
  ),
  capabilities: ConnectorCapabilitiesSchema,
});
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

export const TestConnectionResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  latencyMs: z.number().optional(),
  serverVersion: z.string().optional(),
});
export type TestConnectionResult = z.infer<typeof TestConnectionResultSchema>;
