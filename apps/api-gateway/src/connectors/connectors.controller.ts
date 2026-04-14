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
}
