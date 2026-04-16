import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { ConnectorsService } from '../connectors.service.js';
import { FileParserService } from './file-parser.service.js';
import {
  connectorInstances,
  connectorSyncTables,
  connectorSyncRuns,
  storedFiles,
} from '@pulseboard/shared-db';

@Injectable()
export class UploadService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storageService: StorageService,
    private readonly connectorsService: ConnectorsService,
    private readonly fileParser: FileParserService,
  ) {}

  private get db() {
    return this.database.db;
  }

  /**
   * Upload a file to a CSV connector instance.
   * Parses the file, creates a warehouse table, and loads the data.
   */
  async uploadFile(
    tenantId: string,
    connectorId: string,
    file: Express.Multer.File,
    options?: { delimiter?: string; hasHeader?: boolean },
  ) {
    const connector = await this.connectorsService.getById(tenantId, connectorId);

    if (connector.connectorTypeId !== 'csv') {
      throw new BadRequestException('File upload is only supported for CSV connectors');
    }

    const startTime = Date.now();

    // Save original file to object storage
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'csv';
    const storageKey = `tenants/${tenantId}/uploads/${connectorId}/${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}_${Date.now()}.${ext}`;

    try {
      await this.storageService.storage.upload({
        key: storageKey,
        body: file.buffer,
        contentType: file.mimetype || 'application/octet-stream',
        metadata: { tenant_id: tenantId, connector_id: connectorId },
      });
    } catch (storageErr: any) {
      // Storage failure is non-fatal — log and continue with data loading
      console.warn(`Failed to save file to storage: ${storageErr.message}`);
    }

    // Parse the file
    const parsed = await this.fileParser.parse(file, options);

    // Get or create warehouse schema
    const schemaName = `warehouse_${tenantId.slice(0, 8).toLowerCase()}`;
    const warehouseTable = parsed.tableName;

    // Ensure schema exists
    const postgres = (await import('postgres')).default;
    const sql = postgres(process.env.DATABASE_URL || '');

    try {
      await sql`CREATE SCHEMA IF NOT EXISTS ${sql(schemaName)}`;

      // Build column definitions
      const typeMap: Record<string, string> = {
        string: 'TEXT',
        integer: 'BIGINT',
        decimal: 'NUMERIC',
        boolean: 'BOOLEAN',
        date: 'DATE',
        datetime: 'TIMESTAMPTZ',
      };

      // Drop existing table if re-uploading
      await sql.unsafe(
        `DROP TABLE IF EXISTS ${schemaName}.${warehouseTable}`,
      );

      // Create table
      const colDefs = parsed.columns
        .map((c) => `"${c.name}" ${typeMap[c.type] || 'TEXT'}`)
        .join(', ');

      await sql.unsafe(`
        CREATE TABLE ${schemaName}.${warehouseTable} (
          _pb_id BIGSERIAL,
          _pb_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ${colDefs}
        )
      `);

      // Insert data in batches
      const batchSize = 1000;
      let inserted = 0;

      for (let i = 0; i < parsed.rows.length; i += batchSize) {
        const batch = parsed.rows.slice(i, i + batchSize);
        const colNames = parsed.columns.map((c) => `"${c.name}"`).join(', ');

        for (const row of batch) {
          const values = parsed.columns.map((c) => {
            const val = row[c.name];
            // Empty strings → null for non-string types (PG rejects "" for int/decimal/bool/date)
            if (val === '' || val === undefined || val === null) {
              return null;
            }
            return val;
          });
          const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

          await sql.unsafe(
            `INSERT INTO ${schemaName}.${warehouseTable} (${colNames}) VALUES (${placeholders})`,
            values as any[],
          );
          inserted++;
        }
      }

      // Update connector status
      const durationMs = Date.now() - startTime;

      await this.db
        .update(connectorInstances)
        .set({
          status: 'healthy',
          lastSyncAt: new Date(),
          lastSyncRows: inserted,
          lastSyncDurationMs: durationMs,
          updatedAt: new Date(),
        })
        .where(eq(connectorInstances.id, connectorId));

      // Upsert sync table entry
      const existing = await this.db
        .select()
        .from(connectorSyncTables)
        .where(
          and(
            eq(connectorSyncTables.connectorInstanceId, connectorId),
            eq(connectorSyncTables.sourceTable, file.originalname),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await this.db.insert(connectorSyncTables).values({
          connectorInstanceId: connectorId,
          sourceTable: file.originalname,
          warehouseTable,
          syncEnabled: true,
        });
      }

      // Create sync run record
      const { newId } = await import('@pulseboard/shared-db');
      await this.db.insert(connectorSyncRuns).values({
        id: newId(),
        connectorInstanceId: connectorId,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        status: 'completed',
        rowsSynced: inserted,
        tablesSynced: 1,
        durationMs,
      });

      // Record stored file
      try {
        await this.db.insert(storedFiles).values({
          tenantId,
          key: storageKey,
          originalName: file.originalname,
          contentType: file.mimetype || 'application/octet-stream',
          sizeBytes: file.size,
          storageProvider: this.storageService.storage.name,
          purpose: 'upload',
          connectorId,
        });
      } catch {
        // Non-fatal if stored_files table doesn't exist yet
      }

      await sql.end();

      return {
        success: true,
        tableName: warehouseTable,
        schema: schemaName,
        columns: parsed.columns,
        rowCount: inserted,
        durationMs,
      };
    } catch (error: any) {
      await sql.end().catch(() => {});
      throw new BadRequestException(
        `Failed to process file: ${error.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Preview a file without saving — returns first 50 rows and detected schema.
   */
  async previewFile(
    file: Express.Multer.File,
    options?: { delimiter?: string; hasHeader?: boolean },
  ) {
    const parsed = await this.fileParser.parse(file, options);

    return {
      tableName: parsed.tableName,
      columns: parsed.columns,
      rowCount: parsed.rowCount,
      preview: parsed.rows.slice(0, 50),
    };
  }
}
