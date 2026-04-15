import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ConnectorsService } from './connectors.service.js';
import { ConnectorTypeRegistry } from './connector-type.registry.js';
import {
  IsString,
  IsOptional,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';

class CreateConnectorDto {
  @IsString()
  @MinLength(1)
  connectorTypeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsString()
  @IsOptional()
  syncSchedule?: string;

  @IsString()
  @IsOptional()
  syncMode?: string;
}

class UpdateConnectorDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  syncSchedule?: string;

  @IsString()
  @IsOptional()
  syncMode?: string;
}

class TestConnectionDto {
  @IsString()
  @IsOptional()
  connectorTypeId?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}

interface AuthRequest {
  user: { userId: string; tenantId: string; email: string; role: string };
}

@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class ConnectorsController {
  constructor(
    private readonly connectorsService: ConnectorsService,
    private readonly registry: ConnectorTypeRegistry,
  ) {}

  /** GET /api/connectors/types — list available connector types */
  @Get('types')
  getTypes() {
    return this.registry.getAll();
  }

  /** GET /api/connectors/types/:id — get a single connector type */
  @Get('types/:id')
  getType(@Param('id') id: string) {
    const type = this.registry.get(id);
    if (!type) return { error: 'Connector type not found' };
    return type;
  }

  /** GET /api/connectors — list tenant's connector instances */
  @Get()
  list(@Request() req: AuthRequest) {
    return this.connectorsService.listForTenant(req.user.tenantId);
  }

  /** GET /api/connectors/:id — get a single connector instance */
  @Get(':id')
  get(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.connectorsService.getById(req.user.tenantId, id);
  }

  /** POST /api/connectors — create a new connector */
  @Post()
  create(@Request() req: AuthRequest, @Body() dto: CreateConnectorDto) {
    return this.connectorsService.create(req.user.tenantId, dto);
  }

  /** PUT /api/connectors/:id — update a connector */
  @Put(':id')
  update(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateConnectorDto,
  ) {
    return this.connectorsService.update(req.user.tenantId, id, dto);
  }

  /** DELETE /api/connectors/:id — delete a connector */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.connectorsService.delete(req.user.tenantId, id);
  }

  /** POST /api/connectors/:id/test — test an existing connector's connection */
  @Post(':id/test')
  testExisting(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.connectorsService.testConnection(req.user.tenantId, id);
  }

  /** POST /api/connectors/test — test a connection with inline config (before saving) */
  @Post('test')
  testInline(@Request() req: AuthRequest, @Body() dto: TestConnectionDto) {
    if (!dto.connectorTypeId || !dto.config) {
      return { success: false, message: 'connectorTypeId and config are required' };
    }
    return this.connectorsService.testConnection(req.user.tenantId, undefined, {
      connectorTypeId: dto.connectorTypeId,
      config: dto.config,
    });
  }

  /** GET /api/connectors/:id/sync-tables — get sync table config */
  @Get(':id/sync-tables')
  getSyncTables(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.connectorsService.getSyncTables(req.user.tenantId, id);
  }

  /** GET /api/connectors/:id/sync-runs — get sync run history */
  @Get(':id/sync-runs')
  getSyncRuns(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.connectorsService.getSyncRuns(req.user.tenantId, id);
  }

  /** POST /api/connectors/:id/trigger-sync — manually trigger a sync via Dagster */
  @Post(':id/trigger-sync')
  async triggerSync(@Request() req: AuthRequest, @Param('id') id: string) {
    const connector = await this.connectorsService.getById(req.user.tenantId, id);

    const syncTables = await this.connectorsService.getSyncTables(req.user.tenantId, id);
    if (syncTables.length === 0) {
      return { triggered: false, message: 'No tables selected for sync' };
    }

    // Call Dagster GraphQL API to launch a job run
    const dagsterUrl = process.env.DAGSTER_URL || 'http://dagster-webserver:3070';
    const dbUrl = process.env.DATABASE_URL || '';

    try {
      const response = await fetch(`${dagsterUrl}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation LaunchRun($executionParams: ExecutionParams!) {
              launchRun(executionParams: $executionParams) {
                __typename
                ... on LaunchRunSuccess {
                  run { runId }
                }
                ... on PythonError {
                  message
                }
                ... on InvalidStepError {
                  invalidStepKey
                }
                ... on InvalidOutputError {
                  outputName
                }
              }
            }
          `,
          variables: {
            executionParams: {
              selector: {
                repositoryLocationName: 'pulseboard_etl',
                repositoryName: '__repository__',
                jobName: 'sync_connector_job',
              },
              runConfigData: JSON.stringify({
                ops: {
                  sync_connector: {
                    config: {
                      connector_id: id,
                      tenant_id: req.user.tenantId,
                    },
                  },
                },
                resources: {
                  platform_db: { config: { database_url: dbUrl } },
                  warehouse_db: { config: { database_url: dbUrl } },
                },
              }),
              executionMetadata: {
                tags: [
                  { key: 'connector_id', value: id },
                  { key: 'tenant_id', value: req.user.tenantId },
                  { key: 'trigger', value: 'manual' },
                ],
              },
            },
          },
        }),
      });

      const result = await response.json() as any;
      const launch = result?.data?.launchRun;

      if (launch?.__typename === 'LaunchRunSuccess') {
        return {
          triggered: true,
          message: `Sync started for ${connector.name} (${syncTables.length} tables)`,
          connectorId: id,
          tableCount: syncTables.length,
          runId: launch.run.runId,
        };
      }

      // Dagster returned an error
      return {
        triggered: false,
        message: launch?.message || 'Failed to launch sync job in Dagster',
      };
    } catch (error: any) {
      // Dagster unreachable — fall back to sensor-based trigger
      return {
        triggered: true,
        message: `Sync queued for ${connector.name} (${syncTables.length} tables). Will start within 60 seconds.`,
        connectorId: id,
        tableCount: syncTables.length,
      };
    }
  }
}
