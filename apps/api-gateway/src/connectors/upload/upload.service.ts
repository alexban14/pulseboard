import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { ConnectorsService } from '../connectors.service.js';
import { FileParserService, type ParsedSheet } from './file-parser.service.js';
import {
  connectorInstances,
  connectorSyncTables,
  connectorSyncRuns,
  storedFiles,
} from '@pulseboard/shared-db';

export interface SheetResult {
  sheetName: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rowCount: number;
}

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
      console.warn(`Failed to save file to storage: ${storageErr.message}`);
    }

    // Parse the file (may return multiple sheets for Excel)
    const parsed = await this.fileParser.parse(file, options);

    const schemaName = `warehouse_${tenantId.slice(0, 8).toLowerCase()}`;

    const postgres = (await import('postgres')).default;
    const sql = postgres(process.env.DATABASE_URL || '');

    const typeMap: Record<string, string> = {
      string: 'TEXT',
      integer: 'BIGINT',
      decimal: 'NUMERIC',
      boolean: 'BOOLEAN',
      date: 'DATE',
      datetime: 'TIMESTAMPTZ',
    };

    try {
      await sql`CREATE SCHEMA IF NOT EXISTS ${sql(schemaName)}`;

      let totalRows = 0;
      const sheetResults: SheetResult[] = [];

      // Load each sheet as a separate warehouse table
      for (const sheet of parsed.sheets) {
        const rows = await this.loadSheet(sql, schemaName, sheet, typeMap);
        totalRows += rows;

        sheetResults.push({
          sheetName: sheet.sheetName,
          tableName: sheet.tableName,
          columns: sheet.columns,
          rowCount: rows,
        });

        // Register sync table
        const existing = await this.db
          .select()
          .from(connectorSyncTables)
          .where(
            and(
              eq(connectorSyncTables.connectorInstanceId, connectorId),
              eq(connectorSyncTables.sourceTable, sheet.sheetName),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          await this.db.insert(connectorSyncTables).values({
            connectorInstanceId: connectorId,
            sourceTable: sheet.sheetName,
            warehouseTable: sheet.tableName,
            syncEnabled: true,
          });
        }
      }

      // Update connector status
      const durationMs = Date.now() - startTime;

      await this.db
        .update(connectorInstances)
        .set({
          status: 'healthy',
          lastSyncAt: new Date(),
          lastSyncRows: totalRows,
          lastSyncDurationMs: durationMs,
          updatedAt: new Date(),
        })
        .where(eq(connectorInstances.id, connectorId));

      // Create sync run record
      const { newId } = await import('@pulseboard/shared-db');
      await this.db.insert(connectorSyncRuns).values({
        id: newId(),
        connectorInstanceId: connectorId,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        status: 'completed',
        rowsSynced: totalRows,
        tablesSynced: parsed.sheets.length,
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
        // Non-fatal
      }

      await sql.end();

      return {
        success: true,
        sheets: sheetResults,
        totalRows,
        tablesCreated: parsed.sheets.length,
        schema: schemaName,
        durationMs,
      };
    } catch (error: any) {
      await sql.end().catch(() => {});
      throw new BadRequestException(
        `Failed to process file: ${error.message || 'Unknown error'}`,
      );
    }
  }

  private async loadSheet(
    sql: any,
    schemaName: string,
    sheet: ParsedSheet,
    typeMap: Record<string, string>,
  ): Promise<number> {
    const { tableName, columns, rows } = sheet;

    // Drop existing table if re-uploading
    await sql.unsafe(`DROP TABLE IF EXISTS ${schemaName}.${tableName}`);

    // Create table
    const colDefs = columns
      .map((c) => `"${c.name}" ${typeMap[c.type] || 'TEXT'}`)
      .join(', ');

    await sql.unsafe(`
      CREATE TABLE ${schemaName}.${tableName} (
        _pb_id BIGSERIAL,
        _pb_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ${colDefs}
      )
    `);

    // Insert rows in batches
    let inserted = 0;
    const colNames = columns.map((c) => `"${c.name}"`).join(', ');

    for (let i = 0; i < rows.length; i += 1000) {
      const batch = rows.slice(i, i + 1000);

      for (const row of batch) {
        const values = columns.map((c) => {
          const val = row[c.name];
          if (val === '' || val === undefined || val === null) return null;
          return val;
        });
        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

        await sql.unsafe(
          `INSERT INTO ${schemaName}.${tableName} (${colNames}) VALUES (${placeholders})`,
          values as any[],
        );
        inserted++;
      }
    }

    return inserted;
  }

  async previewFile(
    file: Express.Multer.File,
    options?: { delimiter?: string; hasHeader?: boolean },
  ) {
    const parsed = await this.fileParser.parse(file, options);

    return {
      sheets: parsed.sheets.map((s) => ({
        sheetName: s.sheetName,
        tableName: s.tableName,
        columns: s.columns,
        rowCount: s.rowCount,
        preview: s.rows.slice(0, 50),
      })),
    };
  }
}
