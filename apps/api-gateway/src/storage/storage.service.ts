import { Injectable, OnModuleInit } from '@nestjs/common';
import { StorageFactory, type StorageProvider } from '@pulseboard/shared-storage';

@Injectable()
export class StorageService implements OnModuleInit {
  private provider!: StorageProvider;

  async onModuleInit() {
    this.provider = StorageFactory.fromEnv();

    // Ensure bucket exists (creates on MinIO if missing)
    const healthy = await this.provider.healthCheck();
    if (!healthy) {
      console.warn(`Storage provider "${this.provider.name}" health check failed`);
    }
  }

  get storage(): StorageProvider {
    return this.provider;
  }
}
