export interface StorageConfig {
  provider: 's3' | 'minio' | 'backblaze' | 'azure' | 'local';
  bucket: string;

  // S3-compatible (MinIO, AWS S3, Backblaze B2)
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;

  // Azure Blob
  connectionString?: string;

  // Local filesystem
  basePath?: string;
}

export interface UploadParams {
  /** Storage path: "tenants/{id}/uploads/{filename}" */
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StorageObject {
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

export interface StorageProvider {
  readonly name: string;

  upload(params: UploadParams): Promise<StorageObject>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string, limit?: number): Promise<StorageObject[]>;
  healthCheck(): Promise<boolean>;
}
