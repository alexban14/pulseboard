import { Injectable } from '@nestjs/common';
import type { ConnectorType } from '@pulseboard/shared-types';
import { mysqlConnectorType } from './types/mysql.js';
import { postgresqlConnectorType } from './types/postgresql.js';
import { csvConnectorType } from './types/csv.js';
import { restApiConnectorType } from './types/rest-api.js';

@Injectable()
export class ConnectorTypeRegistry {
  private readonly types = new Map<string, ConnectorType>();

  constructor() {
    this.register(mysqlConnectorType);
    this.register(postgresqlConnectorType);
    this.register(csvConnectorType);
    this.register(restApiConnectorType);
  }

  register(type: ConnectorType): void {
    this.types.set(type.id, type);
  }

  get(id: string): ConnectorType | undefined {
    return this.types.get(id);
  }

  getAll(): ConnectorType[] {
    return Array.from(this.types.values());
  }

  getByCategory(category: string): ConnectorType[] {
    return this.getAll().filter((t) => t.category === category);
  }

  exists(id: string): boolean {
    return this.types.has(id);
  }
}
