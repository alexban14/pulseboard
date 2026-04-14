import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [TenantsController],
})
export class TenantsModule {}
