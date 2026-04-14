import { Module } from '@nestjs/common';
import { ConnectorsController } from './connectors.controller.js';
import { ConnectorsService } from './connectors.service.js';
import { ConnectorTypeRegistry } from './connector-type.registry.js';
import { EncryptionService } from './encryption.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ConnectorsController],
  providers: [ConnectorsService, ConnectorTypeRegistry, EncryptionService],
  exports: [ConnectorsService, ConnectorTypeRegistry, EncryptionService],
})
export class ConnectorsModule {}
