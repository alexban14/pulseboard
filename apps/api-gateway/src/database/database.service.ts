import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@pulseboard/shared-db';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  public readonly db;
  private readonly sql;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('DATABASE_URL');
    this.sql = postgres(url);
    this.db = drizzle(this.sql, { schema });
  }

  async onModuleDestroy() {
    await this.sql.end();
  }
}
