# 04 — System Architecture

## High-Level Architecture

```
                              ┌─────────────────────────┐
                              │   Tenant Dashboard SPA   │
                              │   React + ECharts        │
                              └────────────┬────────────┘
                                           │ HTTPS
                              ┌────────────▼────────────┐
                              │     API Gateway          │
                              │  (NestJS/Bun + Nginx)    │
                              │  Auth, Rate Limit,       │
                              │  Tenant Resolution       │
                              └────────────┬────────────┘
                                           │
         ┌─────────────┬──────────────┬────┴────┬──────────────┬──────────────┬──────────────┐
         │             │              │         │              │              │              │
   ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐ ┌─▼────────┐ ┌──▼───────┐ ┌───▼──────┐ ┌───▼──────┐
   │  Connector │ │ Semantic  │ │  Query    │ │Dashboard │ │ Tenant   │ │  Alert   │ │   NLQ    │
   │  Service   │ │ Layer Svc │ │  Engine   │ │ Service  │ │ Service  │ │  Service │ │  Service │
   │            │ │           │ │           │ │          │ │          │ │          │ │          │
   │ - Registry │ │ - Models  │ │ - Translate│ │- CRUD   │ │- Signup  │ │- Rules   │ │- NL→Query│
   │ - Config   │ │ - Metrics │ │ - Cache   │ │- Widgets │ │- Users   │ │- Evaluate│ │- LLM Rtr│
   │ - Schema   │ │ - Dims    │ │ - Execute │ │- Layout  │ │- Billing │ │- Notify  │ │- Cache   │
   │   discovery│ │ - Joins   │ │ - Export  │ │- Share   │ │- Plans   │ │- Schedule│ │- Usage   │
   └─────┬──────┘ └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
         │               │             │             │            │            │            │
         │    ┌──────────┴─────────────┴─────────────┴────────────┴────────────┴────────────┘
         │    │
   ┌─────▼────▼──────────────────────────────────────────┐
   │               PostgreSQL + TimescaleDB               │
   │                                                      │
   │  ┌──────────┐ ┌────────────┐ ┌───────────────────┐  │
   │  │ platform │ │ tenant_{n} │ │ warehouse_{n}     │  │
   │  │          │ │            │ │                    │  │
   │  │ tenants  │ │ models     │ │ raw_*  (ingested) │  │
   │  │ plans    │ │ metrics    │ │ agg_*  (rollups)  │  │
   │  │ connectors│ │ dashboards│ │ cache_* (results) │  │
   │  │ users    │ │ widgets    │ │                    │  │
   │  └──────────┘ │ queries    │ └───────────────────┘  │
   │               │ alerts     │                         │
   │               └────────────┘                         │
   └──────────────────────▲──────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
  ┌─────▼──────┐  ┌───────▼───────┐  ┌─────▼──────┐
  │  Pipeline   │  │  Pipeline     │  │  Pipeline  │
  │  Orchestrator│  │  Worker (1)  │  │  Worker (N)│
  │  (Dagster)  │  │  (Python)    │  │  (Python)  │
  │             │  │              │  │            │
  │  Scheduling │  │  Extract     │  │  Extract   │
  │  Sensors    │  │  Transform   │  │  Transform │
  │  Monitoring │  │  Load        │  │  Load      │
  └─────────────┘  └──────────────┘  └────────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
        ┌─────▼───┐ ┌─────▼───┐ ┌────▼────┐
        │ MySQL   │ │ REST API│ │ CSV     │
        │ PG, etc │ │ Webhook │ │ Sheets  │
        └─────────┘ └─────────┘ └─────────┘
             External Data Sources

                    ┌──────────────────────────────────────┐
                    │          LLM Providers                │
                    │                                       │
                    │  Anthropic · OpenAI · Groq            │
                    │  OpenRouter · Ollama · Custom         │
                    └──────────────────────────────────────┘
```

---

## Domain-Driven Design (DDD) — Bounded Contexts

### BC1: Tenant & Identity

**Responsibility**: Tenant lifecycle, user management, authentication, billing.

```
Aggregates:
  Tenant           → TenantId, name, slug, plan, status, branding, customDomain
  TenantUser       → UserId, TenantId, role, email, authProvider, externalId
  Subscription     → TenantId, planId, billingCycle, paymentMethod, status
  ApiKey           → TenantId, keyHash, scopes, expiresAt

Domain Events:
  TenantCreated, TenantSuspended, TenantPlanChanged
  UserInvited, UserRoleChanged, UserDeactivated
  SubscriptionActivated, SubscriptionCancelled

Value Objects:
  Plan (free, starter, pro, business, enterprise)
  TenantBranding (logo, primaryColor, favicon)
  AuthConfig (provider, clientId, clientSecret, issuer)
```

### BC2: Connector Registry

**Responsibility**: Available connector types, connector instances per tenant.

```
Aggregates:
  ConnectorType    → TypeId, name, category, configSchema, capabilities
  ConnectorInstance→ InstanceId, TenantId, TypeId, config (encrypted), schedule, status
  SyncJob          → JobId, InstanceId, status, startedAt, rowsSynced, errors

Domain Events:
  ConnectorInstanceCreated, ConnectorTested, ConnectorSyncCompleted, ConnectorSyncFailed
  ConnectorTypeRegistered (platform-level)

Value Objects:
  ConnectorCategory (database, saas, api, file, webhook)
  ConnectorConfig (host, port, db, apiKey, oauth — encrypted)
  SyncSchedule (cron, frequency enum)
  ConnectorCapabilities (incremental, fullRefresh, schemaDiscovery, webhook)
```

### BC3: Schema Discovery

**Responsibility**: Introspect connected sources, discover tables/columns/relationships.

```
Aggregates:
  DiscoveredSchema → SchemaId, ConnectorInstanceId, tables[], discoveredAt
  DiscoveredTable  → name, columns[], primaryKey, estimatedRowCount
  DiscoveredColumn → name, type, nullable, isForeignKey, referencesTable

Domain Events:
  SchemaDiscovered, SchemaChanged, SchemaChangeDetected

Value Objects:
  ColumnType (string, integer, decimal, boolean, date, datetime, json, unknown)
  ForeignKeyRelation (fromTable, fromColumn, toTable, toColumn)
```

### BC4: Semantic Layer

**Responsibility**: Tenant-defined data models — metrics, dimensions, joins, calculated fields.

```
Aggregates:
  SemanticModel    → ModelId, TenantId, name, description, version
  ModelTable       → TableId, ModelId, sourceTable, alias, connectorInstanceId
  ModelJoin        → JoinId, ModelId, leftTableId, rightTableId, joinType, condition
  Metric           → MetricId, ModelId, name, expression, aggregation, format
  Dimension        → DimensionId, ModelId, name, column, type, granularity
  CalculatedField  → FieldId, ModelId, name, expression, resultType
  NamedFilter      → FilterId, ModelId, name, condition

Domain Events:
  ModelCreated, ModelUpdated, ModelVersioned
  MetricDefined, DimensionDefined, JoinDefined

Value Objects:
  Aggregation (sum, count, avg, min, max, count_distinct, median)
  JoinType (inner, left, right, full)
  DimensionType (categorical, temporal, geographic)
  TimeGranularity (minute, hour, day, week, month, quarter, year)
  MetricFormat (number, currency, percentage, duration)
```

### BC5: Query Engine

**Responsibility**: Translate semantic queries into SQL, execute, cache, export.

```
Aggregates:
  SavedQuery       → QueryId, TenantId, ModelId, name, definition
  QueryExecution   → ExecutionId, QueryId, userId, sql, duration, rowCount, cached
  ScheduledReport  → ReportId, QueryId, cron, recipients, format, lastDeliveredAt

Domain Events:
  QueryExecuted, QueryCacheHit, QueryExportGenerated
  ScheduledReportDelivered, ScheduledReportFailed

Value Objects:
  QueryDefinition {
    modelId: string
    metrics: { metricId, alias? }[]
    dimensions: { dimensionId, granularity? }[]
    filters: { field, operator, value }[]
    sort: { field, direction }[]
    limit?: number
    offset?: number
  }
  ExportFormat (excel, csv, pdf, json)
```

### BC6: Dashboard & Visualization

**Responsibility**: Dashboard layouts, widget configuration, sharing.

```
Aggregates:
  Dashboard        → DashboardId, TenantId, name, description, layout, isDefault
  Widget           → WidgetId, DashboardId, type, queryDefinition, displayConfig, position
  DashboardShare   → ShareId, DashboardId, grantedTo, permission
  DashboardFilter  → FilterId, DashboardId, dimensionId, defaultValue

Domain Events:
  DashboardCreated, DashboardUpdated, DashboardShared, DashboardCloned
  WidgetAdded, WidgetMoved, WidgetConfigured

Value Objects:
  WidgetType (kpi_card, line, bar, area, pie, donut, funnel, heatmap, table, gauge, scatter)
  GridPosition (x, y, w, h)
  DisplayConfig (title, colors, legend, axis, numberFormat, prefix, suffix, comparison)
```

### BC7: Alerting

**Responsibility**: Threshold monitoring and notification delivery.

```
Aggregates:
  AlertRule        → AlertId, TenantId, metricId, condition, threshold, channels, cooldown
  AlertEvent       → EventId, AlertId, triggeredAt, metricValue, notifiedVia
```

### BC8: Natural Language Queries

**Responsibility**: Translate natural language into QueryDefinitions via LLM providers.

```
Aggregates:
  NLQConversation  → ConversationId, TenantId, UserId, turns[], currentQuery
  NLQQuery         → QueryId, TenantId, input, normalizedInput, response, provider, model, latency, confidence
  NLQUsage         → TenantId, month, queryCount, cacheHits, totalCost

Domain Events:
  NLQQueryProcessed, NLQCacheHit, NLQProviderFailed, NLQQuotaExceeded

Value Objects:
  LLMProviderConfig (provider, model, apiKey, baseUrl, timeout)
  NLQResponse (queryDefinition, chartType, title, confidence, clarification?)
```

### Shared Infrastructure: LLM Provider Framework

The LLM provider framework is **shared infrastructure** — not owned by any single bounded context. It's used by:
- **NLQ Service** — translate natural language to QueryDefinitions
- **Semantic Layer** — AI-assisted model building (auto-suggest metrics/dimensions)
- **Connector Framework** — smart schema mapping for REST API responses
- **Future** — anomaly detection, forecasting, data quality suggestions

Architecture follows the **Interface + Factory** pattern (inspired by migrobrain):
- `LLMProvider` interface with `chat()`, `estimateCost()`, `healthCheck()`
- `LLMProviderFactory` resolves provider at runtime from tenant config
- 6 built-in providers: Anthropic, OpenAI, Groq, OpenRouter, Ollama, Custom Endpoint
- All providers use OpenAI chat/completions as the standard protocol
- Provider resolution: request override → tenant config → platform default → fallback chain

---

## CQRS Implementation

### Command Side (Write)

```typescript
// Example: CreateSemanticModelCommand
@CommandHandler(CreateSemanticModelCommand)
export class CreateSemanticModelHandler
  implements ICommandHandler<CreateSemanticModelCommand>
{
  constructor(
    private readonly modelRepo: SemanticModelRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateSemanticModelCommand): Promise<string> {
    const model = SemanticModel.create({
      tenantId: command.tenantId,
      name: command.name,
      description: command.description,
    });

    await this.modelRepo.save(model);
    this.eventBus.publish(new ModelCreatedEvent(model.id, command.tenantId));
    return model.id;
  }
}
```

### Query Side (Read)

The query engine translates semantic model definitions into SQL:

```typescript
// QueryTranslator: SemanticQuery → SQL
translate(query: QueryDefinition, tenantId: string): { sql: string; params: unknown[] } {
  const model = this.modelStore.get(query.modelId, tenantId);

  // 1. Resolve tables from model
  const tables = this.resolveTables(model, query);

  // 2. Build SELECT clause from metrics + dimensions
  const select = this.buildSelect(query.metrics, query.dimensions, model);

  // 3. Build FROM + JOIN from model relationships
  const from = this.buildFrom(tables, model.joins);

  // 4. Build WHERE from filters + ALWAYS inject tenant_id
  const where = this.buildWhere(query.filters, tenantId);

  // 5. Build GROUP BY from dimensions
  const groupBy = this.buildGroupBy(query.dimensions);

  // 6. Build ORDER BY + LIMIT
  const orderBy = this.buildOrderBy(query.sort);

  return this.compile(select, from, where, groupBy, orderBy, query.limit);
}
```

### Event Flow

```
Command → CommandHandler → Aggregate → DomainEvent
                                        ├→ EventHandler → Update read model
                                        ├→ EventHandler → Invalidate cache
                                        ├→ EventHandler → Publish to NATS (cross-service)
                                        └→ EventHandler → Trigger side effects
```

---

## Microservice Communication

| Pattern | When | Transport |
|---------|------|-----------|
| **Sync Request/Reply** | API calls from SPA, CRUD, queries | HTTP REST |
| **Async Events** | Pipeline completion, schema changes, alerts | NATS JetStream |
| **Shared Warehouse** | Query Engine reads tenant data | PostgreSQL (RLS-protected) |
| **Cache** | Query results, session, schema metadata | Redis |

---

## Monorepo Structure

```
analytics-platform/
├── apps/
│   ├── api-gateway/              # NestJS — routing, auth, rate limiting, tenant resolution
│   ├── connector-service/        # NestJS — connector registry, schema discovery
│   ├── semantic-service/         # NestJS — semantic model CRUD, validation
│   ├── query-engine/             # NestJS — query translation, execution, caching, export
│   ├── dashboard-service/        # NestJS — dashboard/widget CRUD, sharing
│   ├── tenant-service/           # NestJS — tenants, users, billing, plans
│   ├── alert-service/            # NestJS — alert rules, evaluation, notification
│   ├── (nlq integrated in api-gateway initially, splits to nlq-service later)
│   └── web/                      # React SPA — dashboard UI
│
├── packages/
│   ├── shared-types/             # Zod schemas, DTOs, enums shared across apps
│   ├── shared-db/                # Drizzle schema (platform tables), tenant schema helpers
│   ├── shared-auth/              # JWT/OIDC, tenant context middleware, RLS helpers
│   ├── shared-events/            # NATS event types and client wrapper
│   ├── shared-connectors/        # Connector type definitions, config schemas
│   ├── shared-query/             # Query definition types, SQL builder utilities
│   ├── shared-llm/               # LLM provider interface, factory, built-in providers
│   └── shared-ui/                # React component library (charts, grid, widgets)
│
├── pipelines/                    # Python — Dagster ETL engine
│   ├── engine/
│   │   ├── connectors/           # Connector implementations (db, api, file, webhook)
│   │   │   ├── base.py           # Abstract connector interface
│   │   │   ├── database.py       # Generic SQL database connector
│   │   │   ├── rest_api.py       # Generic REST API connector
│   │   │   ├── csv_upload.py     # CSV/Excel file connector
│   │   │   └── webhook.py        # Webhook event receiver
│   │   ├── transforms/           # Generic transformation functions
│   │   ├── loaders/              # Warehouse loading logic
│   │   ├── discovery/            # Schema introspection logic
│   │   └── scheduling/           # Dynamic pipeline generation per tenant/connector
│   ├── dagster_project/
│   │   ├── assets.py             # Dynamic asset factory (generates per tenant)
│   │   ├── resources.py          # Shared resources (DB pools, API clients)
│   │   ├── sensors.py            # Webhook sensors, schedule sensors
│   │   └── jobs.py               # Job definitions
│   ├── pyproject.toml
│   └── Dockerfile
│
├── connector-sdk/                # TypeScript SDK for third-party connector developers
│   ├── src/
│   │   ├── types.ts              # ConnectorDefinition, ConfigSchema, etc.
│   │   ├── testing.ts            # Test harness for connectors
│   │   └── index.ts
│   └── package.json
│
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.dev.yml
│   │   └── Dockerfiles/
│   ├── k8s/                      # Kubernetes manifests (production)
│   └── terraform/                # Infrastructure-as-code
│
├── turbo.json
├── package.json
├── bun.lockb
└── README.md
```
