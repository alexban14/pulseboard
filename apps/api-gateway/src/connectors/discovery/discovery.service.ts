import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { ConnectorsService } from '../connectors.service.js';
import { ConnectorTypeRegistry } from '../connector-type.registry.js';
import { connectorSyncTables } from '@pulseboard/shared-db';
import type { DiscoveredSchema, DiscoveredTable, DiscoveredColumn } from '@pulseboard/shared-types';

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly connectorsService: ConnectorsService,
    private readonly registry: ConnectorTypeRegistry,
  ) {}

  private get db() {
    return this.database.db;
  }

  /** Discover schema for a connector instance */
  async discover(tenantId: string, connectorId: string): Promise<DiscoveredSchema> {
    const instance = await this.connectorsService.getById(tenantId, connectorId);
    const config = this.connectorsService.getDecryptedConfig(instance);
    const typeId = instance.connectorTypeId;

    if (typeId === 'postgresql') {
      return this.discoverPostgresql(config);
    } else if (typeId === 'mysql') {
      return this.discoverMysql(config);
    }

    throw new BadRequestException(
      `Schema discovery not supported for connector type: ${typeId}`,
    );
  }

  /** Save selected tables for sync */
  async selectTablesForSync(
    tenantId: string,
    connectorId: string,
    tables: { sourceTable: string; incrementalColumn?: string }[],
  ) {
    const instance = await this.connectorsService.getById(tenantId, connectorId);
    const connectorPrefix = instance.connectorTypeId;

    // Delete existing selections for this connector
    await this.db
      .delete(connectorSyncTables)
      .where(eq(connectorSyncTables.connectorInstanceId, connectorId));

    // Insert new selections
    const values = tables.map((t) => ({
      connectorInstanceId: connectorId,
      sourceTable: t.sourceTable,
      warehouseTable: `raw_${connectorPrefix}_${t.sourceTable.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`,
      syncEnabled: true,
      incrementalColumn: t.incrementalColumn ?? null,
    }));

    if (values.length > 0) {
      await this.db.insert(connectorSyncTables).values(values);
    }

    return this.connectorsService.getSyncTables(tenantId, connectorId);
  }

  private async discoverPostgresql(config: Record<string, unknown>): Promise<DiscoveredSchema> {
    const postgres = (await import('postgres')).default;
    const schemaName = (config.schema as string) || 'public';

    const sql = postgres({
      host: config.host as string,
      port: config.port as number,
      database: config.database as string,
      username: config.username as string,
      password: config.password as string,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connect_timeout: 15,
      max: 1,
    });

    try {
      // Get all tables
      const tableRows = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ${schemaName}
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;

      const tables: DiscoveredTable[] = [];

      for (const row of tableRows) {
        const tableName = row.table_name as string;

        // Get columns
        const columnRows = await sql`
          SELECT
            c.column_name,
            c.data_type,
            c.udt_name,
            c.is_nullable,
            c.column_default
          FROM information_schema.columns c
          WHERE c.table_schema = ${schemaName}
            AND c.table_name = ${tableName}
          ORDER BY c.ordinal_position
        `;

        // Get primary key columns
        const pkRows = await sql`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = ${schemaName}
            AND tc.table_name = ${tableName}
            AND tc.constraint_type = 'PRIMARY KEY'
        `;
        const pkColumns = new Set(pkRows.map((r: any) => r.column_name));

        // Get foreign keys
        const fkRows = await sql`
          SELECT
            kcu.column_name,
            ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema = ccu.table_schema
          WHERE tc.table_schema = ${schemaName}
            AND tc.table_name = ${tableName}
            AND tc.constraint_type = 'FOREIGN KEY'
        `;
        const fkMap = new Map(
          fkRows.map((r: any) => [
            r.column_name,
            { table: r.referenced_table, column: r.referenced_column },
          ]),
        );

        // Estimate row count
        const [countRow] = await sql`
          SELECT reltuples::bigint AS estimate
          FROM pg_class
          WHERE relname = ${tableName}
            AND relnamespace = (
              SELECT oid FROM pg_namespace WHERE nspname = ${schemaName}
            )
        `;
        const estimatedRowCount = Number(countRow?.estimate ?? 0);

        const columns: DiscoveredColumn[] = columnRows.map((col: any) => ({
          name: col.column_name,
          type: this.mapPgType(col.data_type, col.udt_name),
          nullable: col.is_nullable === 'YES',
          isPrimaryKey: pkColumns.has(col.column_name),
          isForeignKey: fkMap.has(col.column_name),
          referencesTable: fkMap.get(col.column_name)?.table ?? null,
          referencesColumn: fkMap.get(col.column_name)?.column ?? null,
        }));

        tables.push({
          name: tableName,
          columns,
          primaryKey: Array.from(pkColumns),
          estimatedRowCount: Math.max(0, estimatedRowCount),
        });
      }

      await sql.end();
      return { tables, discoveredAt: new Date() };
    } catch (e) {
      await sql.end().catch(() => {});
      throw e;
    }
  }

  private async discoverMysql(config: Record<string, unknown>): Promise<DiscoveredSchema> {
    const mysql2 = await import('mysql2/promise');
    const dbName = config.database as string;

    const connection = await mysql2.createConnection({
      host: config.host as string,
      port: config.port as number,
      database: dbName,
      user: config.username as string,
      password: config.password as string,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: 15000,
    });

    try {
      // Get all tables
      const [tableRows] = await connection.execute(
        `SELECT table_name, table_rows
         FROM information_schema.tables
         WHERE table_schema = ? AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
        [dbName],
      );

      const tables: DiscoveredTable[] = [];

      for (const row of tableRows as any[]) {
        const tableName = row.TABLE_NAME || row.table_name;
        const estimatedRows = Number(row.TABLE_ROWS || row.table_rows || 0);

        // Get columns
        const [columnRows] = await connection.execute(
          `SELECT column_name, data_type, column_type, is_nullable, column_key, extra
           FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ?
           ORDER BY ordinal_position`,
          [dbName, tableName],
        );

        // Get foreign keys
        const [fkRows] = await connection.execute(
          `SELECT column_name, referenced_table_name, referenced_column_name
           FROM information_schema.key_column_usage
           WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
          [dbName, tableName],
        );

        const fkMap = new Map(
          (fkRows as any[]).map((r) => [
            r.COLUMN_NAME || r.column_name,
            {
              table: r.REFERENCED_TABLE_NAME || r.referenced_table_name,
              column: r.REFERENCED_COLUMN_NAME || r.referenced_column_name,
            },
          ]),
        );

        const primaryKey: string[] = [];
        const columns: DiscoveredColumn[] = (columnRows as any[]).map((col) => {
          const colName = col.COLUMN_NAME || col.column_name;
          const isPK = (col.COLUMN_KEY || col.column_key) === 'PRI';
          if (isPK) primaryKey.push(colName);

          return {
            name: colName,
            type: this.mapMysqlType(col.DATA_TYPE || col.data_type),
            nullable: (col.IS_NULLABLE || col.is_nullable) === 'YES',
            isPrimaryKey: isPK,
            isForeignKey: fkMap.has(colName),
            referencesTable: fkMap.get(colName)?.table ?? null,
            referencesColumn: fkMap.get(colName)?.column ?? null,
          };
        });

        tables.push({
          name: tableName,
          columns,
          primaryKey,
          estimatedRowCount: estimatedRows,
        });
      }

      await connection.end();
      return { tables, discoveredAt: new Date() };
    } catch (e) {
      await connection.end().catch(() => {});
      throw e;
    }
  }

  private mapPgType(dataType: string, udtName: string): string {
    const map: Record<string, string> = {
      'integer': 'integer',
      'bigint': 'integer',
      'smallint': 'integer',
      'numeric': 'decimal',
      'real': 'decimal',
      'double precision': 'decimal',
      'character varying': 'string',
      'character': 'string',
      'text': 'string',
      'boolean': 'boolean',
      'date': 'date',
      'timestamp without time zone': 'datetime',
      'timestamp with time zone': 'datetime',
      'time without time zone': 'string',
      'time with time zone': 'string',
      'jsonb': 'json',
      'json': 'json',
      'uuid': 'string',
      'bytea': 'binary',
      'ARRAY': 'json',
      'USER-DEFINED': udtName === 'geometry' ? 'string' : 'string',
    };
    return map[dataType] ?? 'string';
  }

  private mapMysqlType(dataType: string): string {
    const map: Record<string, string> = {
      'int': 'integer',
      'bigint': 'integer',
      'smallint': 'integer',
      'tinyint': 'integer',
      'mediumint': 'integer',
      'decimal': 'decimal',
      'float': 'decimal',
      'double': 'decimal',
      'varchar': 'string',
      'char': 'string',
      'text': 'string',
      'mediumtext': 'string',
      'longtext': 'string',
      'tinytext': 'string',
      'enum': 'string',
      'set': 'string',
      'date': 'date',
      'datetime': 'datetime',
      'timestamp': 'datetime',
      'time': 'string',
      'year': 'integer',
      'json': 'json',
      'blob': 'binary',
      'mediumblob': 'binary',
      'longblob': 'binary',
      'bit': 'boolean',
      'binary': 'binary',
      'varbinary': 'binary',
    };
    return map[dataType] ?? 'string';
  }
}
