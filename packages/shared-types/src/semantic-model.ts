import { z } from 'zod';

export const AggregationSchema = z.enum([
  'sum',
  'count',
  'avg',
  'min',
  'max',
  'count_distinct',
]);
export type Aggregation = z.infer<typeof AggregationSchema>;

export const JoinTypeSchema = z.enum(['inner', 'left', 'right', 'full']);
export type JoinType = z.infer<typeof JoinTypeSchema>;

export const DimensionTypeSchema = z.enum([
  'categorical',
  'temporal',
  'numeric_bin',
]);
export type DimensionType = z.infer<typeof DimensionTypeSchema>;

export const TimeGranularitySchema = z.enum([
  'day',
  'week',
  'month',
  'quarter',
  'year',
]);
export type TimeGranularity = z.infer<typeof TimeGranularitySchema>;

export const MetricFormatSchema = z.enum([
  'number',
  'currency',
  'percentage',
  'duration',
]);
export type MetricFormat = z.infer<typeof MetricFormatSchema>;

export const ModelStatusSchema = z.enum(['draft', 'published', 'archived']);
export type ModelStatus = z.infer<typeof ModelStatusSchema>;

export const SemanticModelSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().default(null),
  version: z.number().int().default(1),
  status: ModelStatusSchema.default('draft'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SemanticModel = z.infer<typeof SemanticModelSchema>;

export const ModelMetricSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().nullable().default(null),
  tableId: z.string().nullable().default(null),
  columnName: z.string().nullable().default(null),
  aggregation: AggregationSchema,
  expression: z.string().nullable().default(null),
  format: MetricFormatSchema.default('number'),
  formatOptions: z.record(z.unknown()).default({}),
});
export type ModelMetric = z.infer<typeof ModelMetricSchema>;

export const ModelDimensionSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().nullable().default(null),
  tableId: z.string().nullable().default(null),
  columnName: z.string().min(1),
  dimensionType: DimensionTypeSchema.default('categorical'),
  timeGranularity: TimeGranularitySchema.nullable().default(null),
});
export type ModelDimension = z.infer<typeof ModelDimensionSchema>;
