import {
  Controller,
  Get,
  Param,
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

  /** GET /api/storage/download/:fileId — download a stored file via signed URL redirect */
  @Get('download/:fileId')
  async download(
    @Request() req: AuthRequest,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const [file] = await this.database.db
      .select()
      .from(storedFiles)
      .where(
        and(
          eq(storedFiles.id, fileId),
          eq(storedFiles.tenantId, req.user.tenantId),
        ),
      )
      .limit(1);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const url = await this.storageService.storage.getSignedUrl(file.key, 3600);
    res.redirect(url);
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
}
