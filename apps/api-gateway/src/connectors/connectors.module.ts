import { Module } from '@nestjs/common';
import { ConnectorsController } from './connectors.controller.js';
import { ConnectorsService } from './connectors.service.js';
import { ConnectorTypeRegistry } from './connector-type.registry.js';
import { EncryptionService } from './encryption.service.js';
import { DiscoveryController } from './discovery/discovery.controller.js';
import { DiscoveryService } from './discovery/discovery.service.js';
import { UploadController } from './upload/upload.controller.js';
import { UploadService } from './upload/upload.service.js';
import { FileParserService } from './upload/file-parser.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ConnectorsController, DiscoveryController, UploadController],
  providers: [
    ConnectorsService,
    ConnectorTypeRegistry,
    EncryptionService,
    DiscoveryService,
    UploadService,
    FileParserService,
  ],
  exports: [ConnectorsService, ConnectorTypeRegistry, EncryptionService],
})
export class ConnectorsModule {}
