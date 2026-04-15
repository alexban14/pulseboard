# 09 — Frontend Dashboard UI

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | **React 18+** | Widely adopted, strong ecosystem |
| Build | **Vite 5+** | Fast HMR, excellent DX |
| Language | **TypeScript** | Full-stack type sharing |
| State | **TanStack Query + Zustand** | Server state + lightweight client state |
| Charting | **Apache ECharts** | 50+ chart types, Canvas renderer, theming, large dataset perf |
| Layout | **react-grid-layout** | Drag-and-drop grid, serializable, responsive |
| UI Kit | **shadcn/ui + Radix + Tailwind** | Accessible, customizable, modern |
| Forms | **React Hook Form + Zod** | Validation + type safety |
| Tables | **TanStack Table** | Virtual scroll, sort, filter, column resize |
| Router | **React Router 7** | Nested routes, loaders |
| Export | **SheetJS** (Excel), **jsPDF + html2canvas** (PDF) | Client-side export |

---

## Application Shell

```
┌────────────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌── Top Bar ──────────────────────────────────┐ │
│  │  Logo    │  │  Tenant Name  │  Search  │  User ▼  │ ⚙    │ │
│  └──────────┘  └─────────────────────────────────────────────┘ │
│  ┌──────────┐  ┌─────────────────────────────────────────────┐ │
│  │ Sidebar  │  │                                             │ │
│  │          │  │              Content Area                    │ │
│  │ 📊 Dash  │  │                                             │ │
│  │   Dash 1 │  │     (Dashboards, Query Builder, Models,     │ │
│  │   Dash 2 │  │      Connectors, Settings, etc.)            │ │
│  │   Dash 3 │  │                                             │ │
│  │          │  │                                             │ │
│  │ 🔍 Query │  │                                             │ │
│  │ 💬 NLQ   │  │                                             │ │
│  │ 🧩 Models│  │                                             │ │
│  │ 🔌 Sources│ │                                             │ │
│  │ 🔔 Alerts│  │                                             │ │
│  │ 📋 Reports│ │                                             │ │
│  │          │  │                                             │ │
│  │ ─────── │  │                                             │ │
│  │ ⚙ Settings│ │                                             │ │
│  │ 👥 Users │  │                                             │ │
│  └──────────┘  └─────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Navigation Structure

```
/                          → Redirect to default dashboard
/dashboards                → Dashboard list
/dashboards/:id            → View/edit dashboard
/dashboards/:id/present    → Full-screen presentation mode
/queries                   → Saved query list
/queries/new               → Visual query builder
/queries/:id               → View/edit saved query
/nlq                       → Natural language query (conversation UI)
/models                    → Semantic model list
/models/:id                → Visual model builder
/sources                   → Data source list
/sources/new               → Add data source wizard
/sources/:id               → Source detail (schema, sync status)
/alerts                    → Alert rule list
/reports                   → Scheduled report list
/settings                  → Tenant settings
/settings/users            → User management
/settings/billing          → Plan & billing
/settings/branding         → White-label config
/settings/api-keys         → API key management
/onboarding                → First-time setup wizard
```

### NLQ Input Bar

A persistent natural language input is available on every page:

```
┌──────────────────────────────────────────────────────────────┐
│  💬 Ask a question about your data...              [⏎ Ask]  │
└──────────────────────────────────────────────────────────────┘
```

When the user submits a query:
1. Shows a "Thinking..." skeleton
2. NLQ service translates to QueryDefinition (~200-500ms)
3. Query engine executes (~100-500ms)
4. Widget renders with the suggested chart type
5. User can refine ("break it down by month"), save as widget, or edit in query builder

The NLQ result panel appears inline, reusing the existing WidgetRenderer component. The NLQ input bar supports conversation — follow-up queries refine the current result.

See [14-NATURAL-LANGUAGE-QUERIES.md](../planning/14-NATURAL-LANGUAGE-QUERIES.md) for the full NLQ plan.

---

## Dashboard Builder

### Dashboard Canvas

```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard: "Sales Overview"              [Edit] [Share] [⋯] │
│                                                              │
│  ┌── Global Filters ───────────────────────────────────────┐ │
│  │ Date Range: [Last 30 days ▼]  Region: [All ▼]  [Apply] │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐  │
│  │  KPI Card │ │  KPI Card │ │  KPI Card │ │  KPI Card  │  │
│  │ Revenue   │ │ Orders    │ │ Customers │ │ Avg Order  │  │
│  │ €124,500  │ │ 1,234     │ │ 567       │ │ €101       │  │
│  │ ▲ 12.3%   │ │ ▲ 8.1%   │ │ ▼ -2.1%  │ │ ▲ 4.5%    │  │
│  └───────────┘ └───────────┘ └───────────┘ └────────────┘  │
│                                                              │
│  ┌────────────────────────────┐ ┌──────────────────────────┐ │
│  │       Line Chart           │ │      Bar Chart           │ │
│  │   Revenue Over Time        │ │   Orders by Region       │ │
│  │   ╱╲    ╱╲                │ │   ████ North             │ │
│  │  ╱  ╲╱╱  ╲╱╲             │ │   ██████ South           │ │
│  │ ╱         ╲               │ │   ████████ West          │ │
│  └────────────────────────────┘ └──────────────────────────┘ │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                    Data Table                          │   │
│  │  Customer    │ Orders │ Revenue  │ Last Order         │   │
│  │  Acme Corp   │ 45     │ €12,340  │ 2026-04-10        │   │
│  │  Beta Inc    │ 38     │ €9,870   │ 2026-04-09        │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  [+ Add Widget]                          Auto-refresh: 60s ▼ │
└──────────────────────────────────────────────────────────────┘
```

### Widget Configuration Dialog

```
┌──────────────────────────────────────────────────────────────┐
│  Configure Widget                                    [Save]  │
│                                                              │
│  ┌── General ────────────────────────────────────────────┐   │
│  │  Title: [Revenue by Region                 ]          │   │
│  │  Type:  [Bar Chart ▼]                                 │   │
│  │  Model: [Sales Analytics ▼]                           │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── Data ───────────────────────────────────────────────┐   │
│  │  Metrics:                                             │   │
│  │    [Revenue ▼] [SUM]                          [+ Add] │   │
│  │                                                       │   │
│  │  Dimensions:                                          │   │
│  │    [Region ▼]                                 [+ Add] │   │
│  │                                                       │   │
│  │  Filters:                                             │   │
│  │    [Status ▼] [equals ▼] [active ▼]           [+ Add]│   │
│  │                                                       │   │
│  │  Sort: [Revenue ▼] [DESC ▼]    Limit: [10  ]         │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── Display ────────────────────────────────────────────┐   │
│  │  Colors:     [Auto ▼]  or  [Custom palette...]        │   │
│  │  Show Legend: [☑]        Legend Position: [Bottom ▼]   │   │
│  │  Show Labels: [☑]       Number Format: [€ #,##0 ▼]   │   │
│  │  Comparison:  [vs Previous Period ▼]                  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── Preview ────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │    ████████████████ West: €45,200                    │   │
│  │    ████████████ South: €34,100                       │   │
│  │    █████████ North: €25,200                          │   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Widget System

### Widget Config Schema (Zod)

```typescript
export const WidgetConfigSchema = z.object({
  id: z.string().uuid(),
  dashboardId: z.string().uuid(),
  type: z.enum([
    'kpi_card', 'line_chart', 'bar_chart', 'area_chart',
    'pie_chart', 'donut_chart', 'funnel_chart', 'heatmap',
    'table', 'gauge', 'scatter',
  ]),
  title: z.string(),
  position: z.object({
    x: z.number(), y: z.number(),
    w: z.number().min(1).max(12),
    h: z.number().min(1),
  }),
  query: z.object({
    modelId: z.string().uuid(),
    metrics: z.array(z.object({
      metricId: z.string().uuid(),
      alias: z.string().optional(),
    })),
    dimensions: z.array(z.object({
      dimensionId: z.string().uuid(),
      granularity: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
    })).optional(),
    filters: z.array(z.object({
      field: z.string(),
      operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'between', 'like']),
      value: z.unknown(),
    })).optional(),
    namedFilters: z.array(z.string().uuid()).optional(),
    sort: z.array(z.object({
      field: z.string(),
      direction: z.enum(['asc', 'desc']),
    })).optional(),
    limit: z.number().optional(),
  }),
  display: z.object({
    colors: z.array(z.string()).optional(),
    showLegend: z.boolean().default(true),
    showLabels: z.boolean().default(false),
    comparisonPeriod: z.enum(['previous_period', 'previous_year', 'none']).default('none'),
    numberFormat: z.string().optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    legendPosition: z.enum(['top', 'bottom', 'left', 'right']).default('bottom'),
  }).optional(),
});
```

### Widget Registry & Renderer

```typescript
// apps/web/src/components/widgets/WidgetRenderer.tsx

const WIDGET_REGISTRY: Record<WidgetType, React.LazyExoticComponent<any>> = {
  kpi_card:     lazy(() => import('./KPICardWidget')),
  line_chart:   lazy(() => import('./LineChartWidget')),
  bar_chart:    lazy(() => import('./BarChartWidget')),
  area_chart:   lazy(() => import('./AreaChartWidget')),
  pie_chart:    lazy(() => import('./PieChartWidget')),
  donut_chart:  lazy(() => import('./DonutChartWidget')),
  funnel_chart: lazy(() => import('./FunnelChartWidget')),
  heatmap:      lazy(() => import('./HeatmapWidget')),
  table:        lazy(() => import('./TableWidget')),
  gauge:        lazy(() => import('./GaugeWidget')),
  scatter:      lazy(() => import('./ScatterWidget')),
};

export function WidgetRenderer({ widget }: { widget: WidgetConfig }) {
  const { data, isLoading, error } = useWidgetData(widget);
  const Component = WIDGET_REGISTRY[widget.type];

  return (
    <WidgetCard title={widget.title} isLoading={isLoading} error={error}>
      <Suspense fallback={<WidgetSkeleton />}>
        <Component config={widget} data={data} />
      </Suspense>
    </WidgetCard>
  );
}
```

---

## Visual Query Builder

The query builder lets users explore data without writing SQL:

```
┌──────────────────────────────────────────────────────────────┐
│  Query Builder                                 [Save] [Run]  │
│                                                              │
│  Model: [Sales Analytics ▼]                                  │
│                                                              │
│  ┌── Metrics ────────────────┐  ┌── Dimensions ────────────┐ │
│  │                           │  │                          │ │
│  │  ✓ Revenue (SUM)         │  │  ✓ Region               │ │
│  │  ✓ Order Count (COUNT)   │  │  ✓ Product Category     │ │
│  │  ○ Avg Order (AVG)       │  │  ✓ Order Date (Month)   │ │
│  │  ○ Customer Count (CNTD) │  │  ○ Customer Segment     │ │
│  │                           │  │                          │ │
│  │  Available from model:    │  │  Available from model:   │ │
│  │  (click to add)           │  │  (click to add)          │ │
│  └───────────────────────────┘  └──────────────────────────┘ │
│                                                              │
│  ┌── Filters ───────────────────────────────────────────────┐│
│  │  📌 "Active Customers" (named filter)               [×]  ││
│  │  Order Date  [between ▼]  [2025-01-01] [2025-12-31] [×]  ││
│  │  [+ Add Filter]  [+ Add Named Filter]                     ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌── Results ───────────────────────────────────────────────┐│
│  │  Region  │ Category │ Month    │ Revenue  │ Orders       ││
│  │  North   │ Widgets  │ 2025-01  │ €12,450  │ 34           ││
│  │  North   │ Widgets  │ 2025-02  │ €15,200  │ 41           ││
│  │  South   │ Gadgets  │ 2025-01  │ €8,700   │ 22           ││
│  │  ...     │ ...      │ ...      │ ...      │ ...          ││
│  │                                                           ││
│  │  245 rows  •  Query: 128ms  •  Cache: miss               ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  [Save as Widget]  [Export Excel]  [Export CSV]  [Save Query] │
└──────────────────────────────────────────────────────────────┘
```

---

## Theming & White-Label

Business+ tenants can customize the UI:

```typescript
// packages/shared-ui/src/theme/tenant-theme.ts

interface TenantTheme {
  logo: string;           // URL to tenant logo
  favicon: string;        // URL to favicon
  primaryColor: string;   // hex color
  accentColor: string;
  fontFamily?: string;
  chartPalette?: string[]; // default chart colors
}

// Applied via CSS custom properties
function applyTenantTheme(theme: TenantTheme) {
  const root = document.documentElement;
  root.style.setProperty('--primary', theme.primaryColor);
  root.style.setProperty('--accent', theme.accentColor);
  if (theme.fontFamily) {
    root.style.setProperty('--font-family', theme.fontFamily);
  }
}
```

---

## Embeddable Dashboards

Tenants can embed dashboards in their own products:

```html
<!-- Embed snippet (provided in settings) -->
<iframe
  src="https://acme.analyticsplatform.com/embed/dashboard/abc123?token=eyJ..."
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

Embed tokens are:
- Scoped to a specific dashboard
- Time-limited (configurable expiry)
- Tenant-bound (cannot access other tenant's data)
- Optionally pre-filtered (e.g., show only data for a specific customer)

```typescript
// Embed token payload
{
  tenantId: "...",
  dashboardId: "...",
  filters: { customer_id: "cust_123" },  // optional row-level filter
  expiresAt: "2026-05-01T00:00:00Z",
  permissions: ["view"],                  // view only, no edit
}
```

---

## Real-Time Updates (WebSocket)

The frontend maintains a persistent WebSocket connection to the API Gateway via Socket.IO. This replaces polling for most real-time needs.

**Connection lifecycle:**
1. After login, `useRealtimeSocket()` hook establishes a Socket.IO connection
2. JWT token sent on handshake for authentication
3. Server joins the client to their tenant's room (`tenant:{tenantId}`)
4. Events are pushed server -> client (no client polling needed)
5. Auto-reconnect with exponential backoff on disconnect

**Dashboard auto-refresh:**
When a pipeline sync completes, the server pushes `sync:completed` with the affected connector ID. Dashboard widgets that source data from that connector automatically refetch (TanStack Query cache invalidation triggered by the WebSocket event).

```typescript
// In DashboardGrid or a global listener
on('sync:completed', ({ connectorId }) => {
  queryClient.invalidateQueries({ queryKey: ['widget-data'] });
});
```

**NLQ token streaming:**
LLM responses stream token-by-token via `nlq:token` events, rendering progressively like ChatGPT. The `nlq:complete` event signals the final QueryDefinition is ready for chart rendering.

**Fallback:** If WebSocket is unavailable (corporate proxies, etc.), the frontend falls back to TanStack Query polling (30s interval). The `useRealtimeSocket()` hook exposes `isConnected` so the UI can show a connection status indicator.
