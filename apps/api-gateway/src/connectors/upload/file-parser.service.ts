import { Injectable, BadRequestException } from '@nestjs/common';

export interface ParsedSheet {
  sheetName: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface ParsedFile {
  sheets: ParsedSheet[];
  originalName: string;
}

@Injectable()
export class FileParserService {
  async parse(
    file: Express.Multer.File,
    options?: { delimiter?: string; hasHeader?: boolean },
  ): Promise<ParsedFile> {
    const ext = file.originalname.split('.').pop()?.toLowerCase();

    if (ext === 'csv' || ext === 'tsv') {
      const sheet = await this.parseCsv(file, options);
      return { sheets: [sheet], originalName: file.originalname };
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
  ): Promise<ParsedSheet> {
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

    const columns = headers.map((name, i) => ({
      name,
      type: this.inferColumnType(dataRows.map((r) => r[i])),
    }));

    const rows = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? null;
      });
      return obj;
    });

    const tableName = this.fileToTableName(file.originalname);

    return { sheetName: 'Sheet 1', tableName, columns, rows, rowCount: rows.length };
  }

  private async parseExcel(
    file: Express.Multer.File,
    options?: { hasHeader?: boolean },
  ): Promise<ParsedFile> {
    const XLSX = await import('xlsx');

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const hasHeader = options?.hasHeader ?? true;
    const baseTableName = this.fileToTableName(file.originalname);

    if (workbook.SheetNames.length === 0) {
      throw new BadRequestException('Excel file has no sheets');
    }

    const sheets: ParsedSheet[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet?.['!ref']) continue; // skip empty sheets

      const jsonData: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
      });

      if (jsonData.length === 0) continue;

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

      // Skip sheets with no data rows
      if (dataRows.length === 0) continue;

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

      // Table name: base_sheetname (or just base if single sheet)
      const sheetSuffix = workbook.SheetNames.length === 1
        ? ''
        : `_${this.sanitizeColumnName(sheetName)}`;
      const tableName = `${baseTableName}${sheetSuffix}`;

      sheets.push({
        sheetName,
        tableName,
        columns,
        rows,
        rowCount: rows.length,
      });
    }

    if (sheets.length === 0) {
      throw new BadRequestException('No sheets with data found');
    }

    return { sheets, originalName: file.originalname };
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

    const dateRegex = /^\d{4}-\d{2}-\d{2}/;
    const allDates = sample.every((v) => dateRegex.test(v!));
    if (allDates) return 'datetime';

    return 'string';
  }

  sanitizeColumnName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  fileToTableName(filename: string): string {
    const name = filename.replace(/\.[^.]+$/, '');
    return 'upload_' + this.sanitizeColumnName(name);
  }
}
