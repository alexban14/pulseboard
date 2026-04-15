import {
  Controller,
  Post,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { UploadService } from './upload.service.js';

interface AuthRequest {
  user: { userId: string; tenantId: string; email: string; role: string };
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /** POST /api/connectors/:id/upload — upload a CSV/Excel file */
  @Post(':id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(csv|tsv|xlsx|xls)$/i;
        if (!allowed.test(file.originalname)) {
          cb(
            new BadRequestException(
              'Only .csv, .tsv, .xlsx, and .xls files are allowed',
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async upload(
    @Request() req: AuthRequest,
    @Param('id') connectorId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('delimiter') delimiter?: string,
    @Query('hasHeader') hasHeader?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.uploadService.uploadFile(req.user.tenantId, connectorId, file, {
      delimiter: delimiter || undefined,
      hasHeader: hasHeader === 'false' ? false : true,
    });
  }

  /** POST /api/connectors/upload/preview — preview a file without saving */
  @Post('upload/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(csv|tsv|xlsx|xls)$/i;
        if (!allowed.test(file.originalname)) {
          cb(
            new BadRequestException(
              'Only .csv, .tsv, .xlsx, and .xls files are allowed',
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Query('delimiter') delimiter?: string,
    @Query('hasHeader') hasHeader?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.uploadService.previewFile(file, {
      delimiter: delimiter || undefined,
      hasHeader: hasHeader === 'false' ? false : true,
    });
  }
}
