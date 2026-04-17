import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { StorageService } from './storage.service.js';
import { DatabaseService } from '../database/database.service.js';
import { storedFiles } from '@pulseboard/shared-db';

interface AuthRequest {
  user: { userId: string; tenantId: string; email: string; role: string };
}

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly database: DatabaseService,
  ) {}

  /** GET /api/storage/download/:fileId — download via signed URL redirect */
  @Get('download/:fileId')
  async download(
    @Request() req: AuthRequest,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.getFile(req.user.tenantId, fileId);
    const url = await this.storageService.storage.getSignedUrl(file.key, 3600);
    res.redirect(url);
  }

  /** GET /api/storage/preview/:fileId — parse and return first N rows */
  @Get('preview/:fileId')
  async preview(
    @Request() req: AuthRequest,
    @Param('fileId') fileId: string,
    @Query('limit') limitStr?: string,
  ) {
    const file = await this.getFile(req.user.tenantId, fileId);
    const limit = Math.min(parseInt(limitStr ?? '100', 10) || 100, 500);

    // Download from storage
    const buffer = await this.storageService.storage.download(file.key);

    const ext = file.originalName.split('.').pop()?.toLowerCase();

    if (ext === 'csv' || ext === 'tsv') {
      return this.previewCsv(buffer, limit);
    } else if (ext === 'xlsx' || ext === 'xls') {
      return this.previewExcel(buffer, limit);
    }

    return { columns: [], rows: [], totalRows: 0 };
  }

  /** GET /api/storage/files — list stored files for the tenant */
  @Get('files')
  async listFiles(@Request() req: AuthRequest) {
    return this.database.db
      .select()
      .from(storedFiles)
      .where(eq(storedFiles.tenantId, req.user.tenantId))
      .orderBy(storedFiles.createdAt);
  }

  private async getFile(tenantId: string, fileId: string) {
    const [file] = await this.database.db
      .select()
      .from(storedFiles)
      .where(
        and(
          eq(storedFiles.id, fileId),
          eq(storedFiles.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  private async previewCsv(buffer: Buffer, limit: number) {
    const { parse } = await import('csv-parse/sync');
    const content = buffer.toString('utf8');

    // Detect delimiter
    const sample = content.slice(0, 4096);
    const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    for (const ch of sample) {
      if (ch in counts) counts[ch]++;
    }
    let delimiter = ',';
    let max = 0;
    for (const [ch, cnt] of Object.entries(counts)) {
      if (cnt > max) { max = cnt; delimiter = ch; }
    }

    const records: string[][] = parse(buffer, {
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) return { columns: [], rows: [], totalRows: 0 };

    const columns = records[0].map((h, i) => h?.trim() || `column_${i + 1}`);
    const dataRows = records.slice(1);

    const rows = dataRows.slice(0, limit).map((row) => {
      const obj: Record<string, string | null> = {};
      columns.forEach((col, i) => { obj[col] = row[i] ?? null; });
      return obj;
    });

    return { columns, rows, totalRows: dataRows.length };
  }

  private async previewExcel(buffer: Buffer, limit: number) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { columns: [], rows: [], totalRows: 0 };

    const jsonData: unknown[][] = XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName],
      { header: 1, defval: null },
    );

    if (jsonData.length === 0) return { columns: [], rows: [], totalRows: 0 };

    const columns = (jsonData[0] as unknown[]).map(
      (h, i) => String(h ?? '').trim() || `column_${i + 1}`,
    );
    const dataRows = jsonData.slice(1);

    const rows = dataRows.slice(0, limit).map((row) => {
      const obj: Record<string, string | null> = {};
      columns.forEach((col, i) => {
        const val = (row as unknown[])[i];
        obj[col] = val != null ? String(val) : null;
      });
      return obj;
    });

    return { columns, rows, totalRows: dataRows.length };
  }
}
