import { z } from 'zod';

export const ExportFormatSchema = z.enum(['excel', 'csv', 'pdf', 'json']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const FilterOperatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'between',
  'like',
]);
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

export const QueryDefinitionSchema = z.object({
  modelId: z.string(),
  metrics: z.array(
    z.object({
      metricId: z.string(),
      alias: z.string().optional(),
    }),
  ),
  dimensions: z
    .array(
      z.object({
        dimensionId: z.string(),
        granularity: z
          .enum(['day', 'week', 'month', 'quarter', 'year'])
          .optional(),
      }),
    )
    .default([]),
  filters: z
    .array(
      z.object({
        field: z.string(),
        operator: FilterOperatorSchema,
        value: z.unknown(),
      }),
    )
    .default([]),
  sort: z
    .array(
      z.object({
        field: z.string(),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .default([]),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});
export type QueryDefinition = z.infer<typeof QueryDefinitionSchema>;

export const QueryResultSchema = z.object({
  columns: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    }),
  ),
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number(),
  durationMs: z.number(),
  cached: z.boolean(),
});
export type QueryResult = z.infer<typeof QueryResultSchema>;

export const SavedQuerySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().default(null),
  definition: QueryDefinitionSchema,
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SavedQuery = z.infer<typeof SavedQuerySchema>;
