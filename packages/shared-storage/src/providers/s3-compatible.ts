import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, StorageConfig, UploadParams, StorageObject } from '../types.js';

export class S3CompatibleProvider implements StorageProvider {
  readonly name: string;
  private client: S3Client;
  private publicClient: S3Client;
  private bucket: string;

  constructor(config: StorageConfig) {
    this.name = config.provider;
    this.bucket = config.bucket;

    const credentials = {
      accessKeyId: config.accessKeyId ?? '',
      secretAccessKey: config.secretAccessKey ?? '',
    };
    const forcePathStyle = config.forcePathStyle ?? (config.provider === 'minio');
    const region = config.region ?? 'us-east-1';

    // Internal client — used for uploads, downloads, listing (Docker network)
    this.client = new S3Client({
      endpoint: config.endpoint,
      region,
      credentials,
      forcePathStyle,
    });

    // Public client — used for signed URLs (browser-accessible endpoint)
    this.publicClient = new S3Client({
      endpoint: config.publicEndpoint ?? config.endpoint,
      region,
      credentials,
      forcePathStyle,
    });
  }

  async upload(params: UploadParams): Promise<StorageObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        Metadata: params.metadata,
      }),
    );

    return {
      key: params.key,
      size: params.body.length,
      contentType: params.contentType,
      lastModified: new Date(),
      metadata: params.metadata,
    };
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const stream = response.Body;
    if (!stream) throw new Error(`Empty body for key: ${key}`);

    // Convert readable stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix?: string, limit = 1000): Promise<StorageObject[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: limit,
      }),
    );

    return (response.Contents ?? []).map((obj) => ({
      key: obj.Key ?? '',
      size: obj.Size ?? 0,
      contentType: '',
      lastModified: obj.LastModified ?? new Date(),
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.bucket }),
      );
      return true;
    } catch (err: any) {
      // Bucket doesn't exist — try to create it (MinIO dev)
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        try {
          await this.client.send(
            new CreateBucketCommand({ Bucket: this.bucket }),
          );
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }
}
