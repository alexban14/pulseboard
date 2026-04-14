# 06 — Connector Framework

## Overview

The connector framework is how external data enters the platform. It must be:

- **Generic** — support any data source without platform-level code changes.
- **Pluggable** — new connector types can be added at runtime.
- **Secure** — credentials encrypted, connections scoped per tenant.
- **Observable** — health checks, sync logs, error reporting.

---

## Connector Type Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  CONNECTOR TYPE REGISTRY                   │
│                  (Platform-level, shared)                  │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │  Database    │  │  SaaS       │  │  Generic         │ │
│  │  Connectors  │  │  Connectors │  │  Connectors      │ │
│  │             │  │             │  │                  │ │
│  │  • MySQL    │  │  • Stripe   │  │  • REST API      │ │
│  │  • PostgreSQL│ │  • HubSpot  │  │  • GraphQL       │ │
│  │  • MariaDB  │  │  • Shopify  │  │  • Webhook       │ │
│  │  • SQL Server│ │  • Salesforce│ │  • CSV Upload    │ │
│  │  • MongoDB  │  │  • QuickBooks│ │  • Google Sheets │ │
│  │  • ClickHouse│ │  • Xero     │  │  • SFTP          │ │
│  │             │  │  • Jira     │  │                  │ │
│  └─────────────┘  └─────────────┘  └──────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Marketplace Connectors (third-party, SDK-built)     │ │
│  │  • Custom ERP  • Telecom APIs  • Banking APIs  ...   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Connector Type Definition

Every connector type is defined by a JSON schema:

```typescript
// connector-sdk/src/types.ts

export interface ConnectorTypeDefinition {
  /** Unique identifier: "mysql", "stripe", "rest-api" */
  id: string;

  /** Display name: "MySQL Database" */
  name: string;

  /** Category for UI grouping */
  category: 'database' | 'saas' | 'api' | 'file' | 'webhook';

  /** Icon (URL or built-in icon key) */
  icon: string;

  /** Short description */
  description: string;

  /** JSON Schema for connector configuration form */
  configSchema: JSONSchema7;

  /** What this connector can do */
  capabilities: {
    schemaDiscovery: boolean;   // can introspect structure
    incrementalSync: boolean;   // supports delta extraction
    fullRefresh: boolean;       // supports full re-extraction
    webhookIngestion: boolean;  // can receive real-time events
    writeBack: boolean;         // can write data back to source (future)
  };

  /** Auth methods supported */
  authMethods: ('api_key' | 'oauth2' | 'basic' | 'certificate' | 'none')[];

  /** OAuth2 config if applicable */
  oauth2Config?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
}
```

### Example: MySQL Connector Definition

```typescript
export const mysqlConnector: ConnectorTypeDefinition = {
  id: 'mysql',
  name: 'MySQL Database',
  category: 'database',
  icon: 'mysql',
  description: 'Connect to any MySQL or MariaDB database',
  configSchema: {
    type: 'object',
    required: ['host', 'port', 'database', 'username', 'password'],
    properties: {
      host: { type: 'string', title: 'Host', description: 'Database server hostname' },
      port: { type: 'number', title: 'Port', default: 3306 },
      database: { type: 'string', title: 'Database Name' },
      username: { type: 'string', title: 'Username' },
      password: { type: 'string', title: 'Password', format: 'password' },
      ssl: { type: 'boolean', title: 'Use SSL', default: false },
      ssh_tunnel: {
        type: 'object',
        title: 'SSH Tunnel (optional)',
        properties: {
          enabled: { type: 'boolean', default: false },
          host: { type: 'string' },
          port: { type: 'number', default: 22 },
          username: { type: 'string' },
          private_key: { type: 'string', format: 'textarea' },
        },
      },
    },
  },
  capabilities: {
    schemaDiscovery: true,
    incrementalSync: true,
    fullRefresh: true,
    webhookIngestion: false,
    writeBack: false,
  },
  authMethods: ['basic'],
};
```

### Example: Generic REST API Connector Definition

```typescript
export const restApiConnector: ConnectorTypeDefinition = {
  id: 'rest-api',
  name: 'REST API',
  category: 'api',
  icon: 'api',
  description: 'Connect to any REST API endpoint',
  configSchema: {
    type: 'object',
    required: ['base_url'],
    properties: {
      base_url: { type: 'string', title: 'Base URL', format: 'uri' },
      auth_type: {
        type: 'string',
        title: 'Authentication',
        enum: ['none', 'api_key', 'bearer_token', 'basic', 'oauth2'],
        default: 'none',
      },
      api_key: { type: 'string', title: 'API Key', format: 'password' },
      api_key_header: { type: 'string', title: 'API Key Header Name', default: 'Authorization' },
      bearer_token: { type: 'string', title: 'Bearer Token', format: 'password' },
      endpoints: {
        type: 'array',
        title: 'Endpoints to Sync',
        items: {
          type: 'object',
          required: ['name', 'path'],
          properties: {
            name: { type: 'string', title: 'Table Name' },
            path: { type: 'string', title: 'Endpoint Path' },
            method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
            pagination: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['offset', 'cursor', 'page', 'none'] },
                page_param: { type: 'string' },
                limit_param: { type: 'string' },
                limit: { type: 'number', default: 100 },
                data_path: { type: 'string', title: 'JSON path to data array' },
                next_cursor_path: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  capabilities: {
    schemaDiscovery: true,   // via sample request
    incrementalSync: true,   // if endpoint supports date filters
    fullRefresh: true,
    webhookIngestion: false,
    writeBack: false,
  },
  authMethods: ['api_key', 'oauth2', 'basic', 'none'],
};
```

---

## Connector Instance (Tenant-Scoped)

When a tenant configures a connector:

```sql
CREATE TABLE connector_instances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    connector_type_id   VARCHAR(100) NOT NULL,        -- references type registry
    name                VARCHAR(255) NOT NULL,         -- tenant-given name: "Production DB"
    config              BYTEA NOT NULL,                -- encrypted config JSON
    status              VARCHAR(50) DEFAULT 'pending', -- pending, healthy, degraded, error
    last_tested_at      TIMESTAMPTZ,
    last_test_error     TEXT,
    sync_schedule       VARCHAR(100),                  -- cron expression
    sync_mode           VARCHAR(50) DEFAULT 'incremental', -- incremental, full_refresh
    last_sync_at        TIMESTAMPTZ,
    last_sync_rows      INT,
    last_sync_duration  INT,                           -- milliseconds
    next_sync_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- Tracks which tables are selected for sync
CREATE TABLE connector_sync_tables (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_instance_id UUID NOT NULL REFERENCES connector_instances(id) ON DELETE CASCADE,
    source_table          VARCHAR(255) NOT NULL,
    warehouse_table       VARCHAR(255) NOT NULL,  -- name in the tenant's warehouse schema
    sync_enabled          BOOLEAN DEFAULT true,
    incremental_column    VARCHAR(255),            -- column for incremental sync (updated_at, etc.)
    last_sync_value       TEXT,                    -- last seen value of incremental column
    UNIQUE(connector_instance_id, source_table)
);

-- Sync run history
CREATE TABLE connector_sync_runs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_instance_id UUID NOT NULL REFERENCES connector_instances(id),
    started_at            TIMESTAMPTZ NOT NULL,
    completed_at          TIMESTAMPTZ,
    status                VARCHAR(50) NOT NULL,    -- running, completed, failed, cancelled
    rows_synced           INT DEFAULT 0,
    tables_synced         INT DEFAULT 0,
    error_message         TEXT,
    duration_ms           INT
);
```

---

## Connector Configuration UI

```
┌──────────────────────────────────────────────────────────────┐
│  Add Data Source                                              │
│                                                              │
│  ┌── Select Connector Type ────────────────────────────────┐ │
│  │                                                          │ │
│  │  Databases                                               │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │ │
│  │  │ MySQL  │ │Postgre │ │MariaDB │ │SQL Svr │ │MongoDB│ │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └───────┘ │ │
│  │                                                          │ │
│  │  SaaS Applications                                       │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │ │
│  │  │ Stripe │ │HubSpot │ │Shopify │ │Salesfrc│           │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │ │
│  │                                                          │ │
│  │  Generic                                                 │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │ │
│  │  │REST API│ │GraphQL │ │CSV/XLS │ │Webhook │           │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │ │
│  │                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌── Configure Connection ─────────────────────────────────┐ │
│  │  Name:     [Production Database          ]              │ │
│  │  Host:     [db.example.com               ]              │ │
│  │  Port:     [3306                         ]              │ │
│  │  Database: [myapp_production             ]              │ │
│  │  Username: [readonly_user                ]              │ │
│  │  Password: [••••••••••                   ]              │ │
│  │  SSL:      [☑ Use SSL]                                  │ │
│  │                                                          │ │
│  │  Schedule: [Every 15 minutes ▼]                          │ │
│  │  Mode:     [◉ Incremental  ○ Full Refresh]              │ │
│  │                                                          │ │
│  │  [Test Connection]  [Save & Discover Schema →]          │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Pipeline Execution (Dagster)

### Dynamic Asset Generation

Unlike hard-coded assets per table, the platform **dynamically generates** Dagster
assets based on each tenant's connector configuration:

```python
# pipelines/dagster_project/assets.py

from dagster import Definitions, asset, AssetExecutionContext

def build_tenant_assets(tenant_id: str, connector_config: dict):
    """Dynamically generate Dagster assets for a tenant's connector."""
    assets = []

    for table in connector_config['sync_tables']:
        @asset(
            name=f"tenant_{tenant_id[:8]}_{table['warehouse_table']}",
            group_name=f"tenant_{tenant_id[:8]}",
            metadata={
                "tenant_id": tenant_id,
                "connector_id": connector_config['id'],
                "source_table": table['source_table'],
            },
        )
        def sync_table(
            context: AssetExecutionContext,
            warehouse: WarehouseResource,
            connector_registry: ConnectorRegistryResource,
        ):
            connector = connector_registry.get_connector(
                type_id=connector_config['type_id'],
                config=connector_config['decrypted_config'],
            )

            if table.get('incremental_column'):
                last_value = warehouse.get_last_sync_value(
                    tenant_id, table['warehouse_table']
                )
                data = connector.extract_incremental(
                    table=table['source_table'],
                    column=table['incremental_column'],
                    since=last_value,
                )
            else:
                data = connector.extract_full(table=table['source_table'])

            warehouse.load(
                tenant_id=tenant_id,
                table=table['warehouse_table'],
                data=data,
                mode='upsert' if table.get('incremental_column') else 'replace',
            )

        assets.append(sync_table)

    return assets
```

### Connector Implementation (Python)

```python
# pipelines/engine/connectors/base.py

from abc import ABC, abstractmethod
from typing import Iterator
import polars as pl

class BaseConnector(ABC):
    """Interface all connectors must implement."""

    @abstractmethod
    def test_connection(self) -> bool:
        """Verify the connection is valid."""
        ...

    @abstractmethod
    def discover_schema(self) -> DiscoveredSchema:
        """Introspect source and return schema."""
        ...

    @abstractmethod
    def extract_full(self, table: str) -> pl.DataFrame:
        """Full extraction of a table."""
        ...

    @abstractmethod
    def extract_incremental(
        self, table: str, column: str, since: str | None
    ) -> pl.DataFrame:
        """Incremental extraction since last sync point."""
        ...


# pipelines/engine/connectors/database.py

class DatabaseConnector(BaseConnector):
    """Generic SQL database connector (MySQL, PG, MariaDB, SQL Server)."""

    def __init__(self, config: dict):
        self.engine = sqlalchemy.create_engine(
            self._build_url(config),
            pool_size=2,
            pool_timeout=30,
        )

    def test_connection(self) -> bool:
        with self.engine.connect() as conn:
            conn.execute(sqlalchemy.text("SELECT 1"))
        return True

    def discover_schema(self) -> DiscoveredSchema:
        return SchemaIntrospector().discover(self)

    def extract_full(self, table: str) -> pl.DataFrame:
        query = f"SELECT * FROM {self._quote(table)}"
        return pl.read_database(query, self.engine)

    def extract_incremental(
        self, table: str, column: str, since: str | None
    ) -> pl.DataFrame:
        if since is None:
            return self.extract_full(table)

        query = f"SELECT * FROM {self._quote(table)} WHERE {self._quote(column)} > :since"
        return pl.read_database(query, self.engine, params={"since": since})


# pipelines/engine/connectors/rest_api.py

class RESTAPIConnector(BaseConnector):
    """Generic REST API connector with pagination support."""

    def __init__(self, config: dict):
        self.base_url = config['base_url']
        self.auth = self._build_auth(config)
        self.endpoints = config.get('endpoints', [])

    def extract_full(self, table: str) -> pl.DataFrame:
        endpoint = self._find_endpoint(table)
        all_records = []

        for page in self._paginate(endpoint):
            all_records.extend(page)

        return pl.DataFrame(all_records)

    def discover_schema(self) -> DiscoveredSchema:
        tables = []
        for endpoint in self.endpoints:
            sample = self._fetch_sample(endpoint)
            columns = self._infer_columns(sample)
            tables.append(DiscoveredTable(
                name=endpoint['name'],
                columns=columns,
            ))
        return DiscoveredSchema(tables=tables)
```

---

## AI-Powered Schema Mapping

For REST API and webhook connectors where the response structure isn't a flat table, the platform can use the **shared LLM provider framework** to intelligently map JSON responses to tabular schemas.

```
REST API returns:
{
  "data": {
    "orders": [
      { "id": 1, "customer": { "name": "Acme", "region": "EU" }, "items": [...], "total": 150.00 }
    ],
    "pagination": { "page": 1, "total": 50 }
  }
}

LLM analyzes and suggests:
  - Data array path: $.data.orders
  - Flatten nested: customer.name → customer_name, customer.region → customer_region
  - Ignore: pagination (metadata), items (nested array — offer as separate table)
  - Columns: id (integer), customer_name (string), customer_region (string), total (decimal)
```

This uses the same LLM provider the tenant has configured for NLQ — no separate AI configuration needed. It's a one-time operation during connector setup (not per-sync), so cost is negligible.

Available for Pro+ plans. Free/Starter tenants manually map JSON fields.

---

## Built-in Connector Roadmap

| Phase | Connectors |
|-------|-----------|
| **Phase 1 (MVP)** | MySQL, PostgreSQL, CSV Upload, Generic REST API |
| **Phase 2** | MariaDB, SQL Server, MongoDB, Google Sheets, Webhook |
| **Phase 3** | Stripe, HubSpot, Shopify, QuickBooks, Xero |
| **Phase 4+** | Salesforce, Jira, WATI, telecom APIs, banking APIs, Connector SDK + Marketplace |

---

## Connector SDK (Phase 3+)

Third-party developers build connectors using a TypeScript SDK:

```typescript
// Example: Custom connector for a telecom API
import { defineConnector, SchemaField } from '@analytics-platform/connector-sdk';

export default defineConnector({
  id: 'inside-telecom',
  name: 'Inside Telecom',
  category: 'api',
  configSchema: { /* ... */ },

  async testConnection(config) {
    const client = new InsideTelecomClient(config);
    await client.authenticate();
    return true;
  },

  async discoverSchema(config) {
    return {
      tables: [
        { name: 'calls', columns: [ /* ... */ ] },
        { name: 'sms', columns: [ /* ... */ ] },
      ],
    };
  },

  async *extractFull(config, table) {
    const client = new InsideTelecomClient(config);
    for await (const page of client.paginate(table)) {
      yield page;
    }
  },
});
```

Published connectors appear in the marketplace for all tenants to use.
