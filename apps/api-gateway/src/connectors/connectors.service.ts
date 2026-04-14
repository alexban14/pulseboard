import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ConnectorTypeRegistry } from './connector-type.registry.js';
import { EncryptionService } from './encryption.service.js';
import {
  connectorInstances,
  connectorSyncTables,
  connectorSyncRuns,
} from '@pulseboard/shared-db';
import type { TestConnectionResult } from '@pulseboard/shared-types';

@Injectable()
export class ConnectorsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly registry: ConnectorTypeRegistry,
    private readonly encryption: EncryptionService,
  ) {}

  private get db() {
    return this.database.db;
  }

  /** List all connector instances for a tenant */
  async listForTenant(tenantId: string) {
    return this.db
      .select()
      .from(connectorInstances)
      .where(eq(connectorInstances.tenantId, tenantId));
  }

  /** Get a single connector instance */
  async getById(tenantId: string, connectorId: string) {
    const [instance] = await this.db
      .select()
      .from(connectorInstances)
      .where(
        and(
          eq(connectorInstances.id, connectorId),
          eq(connectorInstances.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!instance) throw new NotFoundException('Connector not found');
    return instance;
  }

  /** Create a new connector instance */
  async create(
    tenantId: string,
    data: {
      connectorTypeId: string;
      name: string;
      config: Record<string, unknown>;
      syncSchedule?: string | null;
      syncMode?: string;
    },
  ) {
    if (!this.registry.exists(data.connectorTypeId)) {
      throw new BadRequestException(
        `Unknown connector type: ${data.connectorTypeId}`,
      );
    }

    const encryptedConfig = this.encryption.encrypt(
      JSON.stringify(data.config),
    );

    const [instance] = await this.db
      .insert(connectorInstances)
      .values({
        tenantId,
        connectorTypeId: data.connectorTypeId,
        name: data.name,
        config: encryptedConfig,
        syncSchedule: data.syncSchedule ?? null,
        syncMode: data.syncMode ?? 'incremental',
        status: 'pending',
      })
      .returning();

    return instance;
  }

  /** Update a connector instance */
  async update(
    tenantId: string,
    connectorId: string,
    data: {
      name?: string;
      config?: Record<string, unknown>;
      syncSchedule?: string | null;
      syncMode?: string;
    },
  ) {
    await this.getById(tenantId, connectorId); // throws if not found

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.name) updates.name = data.name;
    if (data.syncSchedule !== undefined)
      updates.syncSchedule = data.syncSchedule;
    if (data.syncMode) updates.syncMode = data.syncMode;
    if (data.config) {
      updates.config = this.encryption.encrypt(JSON.stringify(data.config));
      updates.status = 'pending'; // re-test needed after config change
    }

    const [updated] = await this.db
      .update(connectorInstances)
      .set(updates)
      .where(
        and(
          eq(connectorInstances.id, connectorId),
          eq(connectorInstances.tenantId, tenantId),
        ),
      )
      .returning();

    return updated;
  }

  /** Delete a connector instance and all related data */
  async delete(tenantId: string, connectorId: string) {
    await this.getById(tenantId, connectorId);

    // Delete sync tables and runs first (FK constraint)
    await this.db
      .delete(connectorSyncRuns)
      .where(eq(connectorSyncRuns.connectorInstanceId, connectorId));
    await this.db
      .delete(connectorSyncTables)
      .where(eq(connectorSyncTables.connectorInstanceId, connectorId));
    await this.db
      .delete(connectorInstances)
      .where(
        and(
          eq(connectorInstances.id, connectorId),
          eq(connectorInstances.tenantId, tenantId),
        ),
      );
  }

  /** Test a connection using provided or stored config */
  async testConnection(
    tenantId: string,
    connectorId?: string,
    rawConfig?: { connectorTypeId: string; config: Record<string, unknown> },
  ): Promise<TestConnectionResult> {
    let typeId: string;
    let config: Record<string, unknown>;

    if (connectorId) {
      const instance = await this.getById(tenantId, connectorId);
      typeId = instance.connectorTypeId;
      config = JSON.parse(this.encryption.decrypt(instance.config));
    } else if (rawConfig) {
      typeId = rawConfig.connectorTypeId;
      config = rawConfig.config;
    } else {
      throw new BadRequestException(
        'Either connectorId or config must be provided',
      );
    }

    const type = this.registry.get(typeId);
    if (!type) throw new BadRequestException(`Unknown connector type: ${typeId}`);

    const startTime = Date.now();

    try {
      if (typeId === 'mysql' || typeId === 'postgresql') {
        return await this.testDatabaseConnection(typeId, config, startTime);
      }

      return {
        success: false,
        message: `Test connection not yet implemented for type: ${typeId}`,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      if (connectorId) {
        await this.db
          .update(connectorInstances)
          .set({
            status: 'error',
            lastTestedAt: new Date(),
            lastTestError: error.message,
          })
          .where(eq(connectorInstances.id, connectorId));
      }

      return {
        success: false,
        message: error.message ?? 'Connection failed',
        latencyMs,
      };
    }
  }

  private async testDatabaseConnection(
    typeId: string,
    config: Record<string, unknown>,
    startTime: number,
  ): Promise<TestConnectionResult> {
    // Dynamic import to avoid loading DB drivers at module init
    const postgres = (await import('postgres')).default;
    const mysql2 = typeId === 'mysql' ? await import('mysql2/promise') : null;

    let serverVersion = '';

    if (typeId === 'postgresql') {
      const sql = postgres({
        host: config.host as string,
        port: config.port as number,
        database: config.database as string,
        username: config.username as string,
        password: config.password as string,
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
        connect_timeout: 10,
        max: 1,
      });

      try {
        const [result] = await sql`SELECT version() as version`;
        serverVersion = result.version;
        await sql.end();
      } catch (e) {
        await sql.end().catch(() => {});
        throw e;
      }
    } else if (typeId === 'mysql' && mysql2) {
      const connection = await mysql2.createConnection({
        host: config.host as string,
        port: config.port as number,
        database: config.database as string,
        user: config.username as string,
        password: config.password as string,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 10000,
      });

      try {
        const [rows] = await connection.execute('SELECT VERSION() as version');
        serverVersion = (rows as any)[0]?.version ?? '';
        await connection.end();
      } catch (e) {
        await connection.end().catch(() => {});
        throw e;
      }
    }

    const latencyMs = Date.now() - startTime;

    // Update connector status if this was a stored connector
    // (handled by the controller after the call)

    return {
      success: true,
      message: 'Connection successful',
      latencyMs,
      serverVersion,
    };
  }

  /** Decrypt config for internal use (e.g., schema discovery) */
  getDecryptedConfig(instance: typeof connectorInstances.$inferSelect): Record<string, unknown> {
    return JSON.parse(this.encryption.decrypt(instance.config));
  }

  /** Get sync runs for a connector */
  async getSyncRuns(tenantId: string, connectorId: string, limit = 20) {
    await this.getById(tenantId, connectorId);

    return this.db
      .select()
      .from(connectorSyncRuns)
      .where(eq(connectorSyncRuns.connectorInstanceId, connectorId))
      .orderBy(connectorSyncRuns.startedAt)
      .limit(limit);
  }

  /** Get sync tables for a connector */
  async getSyncTables(tenantId: string, connectorId: string) {
    await this.getById(tenantId, connectorId);

    return this.db
      .select()
      .from(connectorSyncTables)
      .where(eq(connectorSyncTables.connectorInstanceId, connectorId));
  }
}
