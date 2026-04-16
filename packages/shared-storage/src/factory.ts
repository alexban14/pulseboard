import type { StorageConfig, StorageProvider } from './types.js';
import { S3CompatibleProvider } from './providers/s3-compatible.js';
import { LocalFileSystemProvider } from './providers/local-filesystem.js';

export class StorageFactory {
  static create(config: StorageConfig): StorageProvider {
    switch (config.provider) {
      case 's3':
      case 'minio':
      case 'backblaze':
        return new S3CompatibleProvider(config);

      case 'local':
        return new LocalFileSystemProvider(config);

      // Azure: added in Phase 3
      // case 'azure':
      //   return new AzureBlobProvider(config);

      default:
        throw new Error(
          `Unsupported storage provider: "${config.provider}". ` +
          `Supported: s3, minio, backblaze, local`,
        );
    }
  }

  /**
   * Create a StorageProvider from environment variables.
   *
   * STORAGE_PROVIDER=minio|s3|backblaze|local
   * STORAGE_BUCKET=pulseboard
   * STORAGE_ENDPOINT=http://minio:9000
   * STORAGE_REGION=us-east-1
   * STORAGE_ACCESS_KEY=minioadmin
   * STORAGE_SECRET_KEY=minioadmin
   * STORAGE_FORCE_PATH_STYLE=true
   * STORAGE_BASE_PATH=/data/storage  (local only)
   */
  static fromEnv(): StorageProvider {
    const provider = (process.env.STORAGE_PROVIDER ?? 'local') as StorageConfig['provider'];

    return StorageFactory.create({
      provider,
      bucket: process.env.STORAGE_BUCKET ?? 'pulseboard',
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION ?? 'us-east-1',
      accessKeyId: process.env.STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.STORAGE_SECRET_KEY,
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
      basePath: process.env.STORAGE_BASE_PATH ?? '/data/storage',
    });
  }
}
