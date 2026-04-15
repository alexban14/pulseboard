import { Injectable, BadRequestException } from '@nestjs/common';

interface ParsedFile {
  tableName: string;
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

@Injectable()
export class FileParserService {
  async parse(
    file: Express.Multer.File,
    options?: { delimiter?: string; hasHeader?: boolean },
  ): Promise<ParsedFile> {
    const ext = file.originalname.split('.').pop()?.toLowerCase();

    if (ext === 'csv' || ext === 'tsv') {
      return this.parseCsv(file, options);
    } else if (ext === 'xlsx' || ext === 'xls') {
      return this.parseExcel(file, options);
    }

    throw new BadRequestException(
      `Unsupported file type: .${ext}. Use .csv, .tsv, .xlsx, or .xls`,
    );
  }

  private async parseCsv(
    file: Express.Multer.File,
    options?: { delimiter?: string; hasHeader?: boolean },
  ): Promise<ParsedFile> {
    const { parse } = await import('csv-parse/sync');

    const delimiter = options?.delimiter ?? this.detectDelimiter(file.buffer);
    const hasHeader = options?.hasHeader ?? true;

    const records: string[][] = parse(file.buffer, {
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) {
      throw new BadRequestException('File is empty');
    }

    let headers: string[];
    let dataRows: string[][];

    if (hasHeader) {
      headers = records[0].map((h, i) => this.sanitizeColumnName(h) || `column_${i + 1}`);
      dataRows = records.slice(1);
    } else {
      headers = records[0].map((_, i) => `column_${i + 1}`);
      dataRows = records;
    }

    // Detect column types from data
    const columns = headers.map((name, i) => ({
      name,
      type: this.inferColumnType(dataRows.map((r) => r[i])),
    }));

    // Build row objects
    const rows = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? null;
      });
      return obj;
    });

    const tableName = this.fileToTableName(file.originalname);

    return { tableName, columns, rows, rowCount: rows.length };
  }

  private async parseExcel(
    file: Express.Multer.File,
    options?: { hasHeader?: boolean },
  ): Promise<ParsedFile> {
    const XLSX = await import('xlsx');

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Excel file has no sheets');
    }

    const sheet = workbook.Sheets[sheetName];
    const hasHeader = options?.hasHeader ?? true;

    const jsonData: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
    });

    if (jsonData.length === 0) {
      throw new BadRequestException('Sheet is empty');
    }

    let headers: string[];
    let dataRows: unknown[][];

    if (hasHeader) {
      headers = (jsonData[0] as unknown[]).map(
        (h, i) => this.sanitizeColumnName(String(h ?? '')) || `column_${i + 1}`,
      );
      dataRows = jsonData.slice(1);
    } else {
      headers = (jsonData[0] as unknown[]).map((_, i) => `column_${i + 1}`);
      dataRows = jsonData;
    }

    const columns = headers.map((name, i) => ({
      name,
      type: this.inferColumnType(
        dataRows.map((r) => (r[i] != null ? String(r[i]) : undefined)),
      ),
    }));

    const rows = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const val = (row as unknown[])[i];
        obj[h] = val != null ? String(val) : null;
      });
      return obj;
    });

    const tableName = this.fileToTableName(file.originalname);

    return { tableName, columns, rows, rowCount: rows.length };
  }

  private detectDelimiter(buffer: Buffer): string {
    const sample = buffer.toString('utf8', 0, Math.min(buffer.length, 4096));
    const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };

    for (const char of sample) {
      if (char in counts) counts[char]++;
    }

    let best = ',';
    let max = 0;
    for (const [char, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        best = char;
      }
    }
    return best;
  }

  private inferColumnType(values: (string | undefined)[]): string {
    const sample = values.filter((v) => v != null && v !== '').slice(0, 100);
    if (sample.length === 0) return 'string';

    const allIntegers = sample.every((v) => /^-?\d+$/.test(v!));
    if (allIntegers) return 'integer';

    const allDecimals = sample.every((v) => /^-?\d+\.?\d*$/.test(v!));
    if (allDecimals) return 'decimal';

    const allBooleans = sample.every((v) =>
      ['true', 'false', '0', '1', 'yes', 'no'].includes(v!.toLowerCase()),
    );
    if (allBooleans) return 'boolean';

    // Date detection (ISO format or common patterns)
    const dateRegex = /^\d{4}-\d{2}-\d{2}/;
    const allDates = sample.every((v) => dateRegex.test(v!));
    if (allDates) return 'datetime';

    return 'string';
  }

  private sanitizeColumnName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private fileToTableName(filename: string): string {
    const name = filename.replace(/\.[^.]+$/, '');
    return 'upload_' + this.sanitizeColumnName(name);
  }
}
