import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { DiscoveryService } from './discovery.service.js';
import { IsArray, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SyncTableSelection {
  @IsString()
  sourceTable!: string;

  @IsString()
  @IsOptional()
  incrementalColumn?: string;
}

class SelectTablesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncTableSelection)
  tables!: SyncTableSelection[];
}

interface AuthRequest {
  user: { userId: string; tenantId: string; email: string; role: string };
}

@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  /** POST /api/connectors/:id/discover — discover source schema */
  @Post(':id/discover')
  discover(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.discoveryService.discover(req.user.tenantId, id);
  }

  /** POST /api/connectors/:id/select-tables — save table selection for sync */
  @Post(':id/select-tables')
  selectTables(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: SelectTablesDto,
  ) {
    return this.discoveryService.selectTablesForSync(
      req.user.tenantId,
      id,
      dto.tables,
    );
  }
}
