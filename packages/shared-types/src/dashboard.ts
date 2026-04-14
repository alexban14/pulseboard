import { z } from 'zod';

export const WidgetTypeSchema = z.enum([
  'kpi_card',
  'line_chart',
  'bar_chart',
  'area_chart',
  'pie_chart',
  'donut_chart',
  'funnel_chart',
  'heatmap',
  'table',
  'gauge',
  'scatter',
]);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

export const GridPositionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1),
});
export type GridPosition = z.infer<typeof GridPositionSchema>;

export const DashboardSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().default(null),
  isDefault: z.boolean().default(false),
  createdBy: z.string().nullable().default(null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

export const CreateDashboardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().default(null),
});
export type CreateDashboard = z.infer<typeof CreateDashboardSchema>;

export const WidgetDisplayConfigSchema = z.object({
  colors: z.array(z.string()).optional(),
  showLegend: z.boolean().default(true),
  showLabels: z.boolean().default(false),
  comparisonPeriod: z
    .enum(['previous_period', 'previous_year', 'none'])
    .default('none'),
  numberFormat: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  legendPosition: z
    .enum(['top', 'bottom', 'left', 'right'])
    .default('bottom'),
});
export type WidgetDisplayConfig = z.infer<typeof WidgetDisplayConfigSchema>;

export const WidgetQuerySchema = z.object({
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
    .optional(),
  filters: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum([
          'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
          'in', 'not_in', 'between', 'like',
        ]),
        value: z.unknown(),
      }),
    )
    .optional(),
  namedFilters: z.array(z.string()).optional(),
  sort: z
    .array(
      z.object({
        field: z.string(),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .optional(),
  limit: z.number().int().positive().optional(),
});
export type WidgetQuery = z.infer<typeof WidgetQuerySchema>;

export const WidgetSchema = z.object({
  id: z.string(),
  dashboardId: z.string(),
  type: WidgetTypeSchema,
  title: z.string(),
  position: GridPositionSchema,
  query: WidgetQuerySchema,
  display: WidgetDisplayConfigSchema.optional(),
});
export type Widget = z.infer<typeof WidgetSchema>;
