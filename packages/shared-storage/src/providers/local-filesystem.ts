import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { StorageProvider, StorageConfig, UploadParams, StorageObject } from '../types.js';

export class LocalFileSystemProvider implements StorageProvider {
  readonly name = 'local';
  private basePath: string;

  constructor(config: StorageConfig) {
    this.basePath = config.basePath ?? '/data/storage';
  }

  private fullPath(key: string): string {
    // Prevent directory traversal
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.join(this.basePath, normalized);
  }

  async upload(params: UploadParams): Promise<StorageObject> {
    const filePath = this.fullPath(params.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, params.body);

    // Store metadata as a sidecar JSON file
    const metaPath = filePath + '.meta.json';
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        contentType: params.contentType,
        metadata: params.metadata,
        uploadedAt: new Date().toISOString(),
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
    return fs.readFile(this.fullPath(key));
  }

  async getSignedUrl(key: string): Promise<string> {
    // Local dev: return an API route for download
    return `/api/storage/download/${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.fullPath(key);
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(filePath + '.meta.json').catch(() => {});
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix?: string, limit = 1000): Promise<StorageObject[]> {
    const dir = prefix ? this.fullPath(prefix) : this.basePath;
    const results: StorageObject[] = [];

    try {
      const entries = await fs.readdir(dir, { recursive: true });
      for (const entry of entries) {
        if (entry.endsWith('.meta.json')) continue;
        if (results.length >= limit) break;

        const filePath = path.join(dir, entry);
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat || !stat.isFile()) continue;

        const key = prefix
          ? path.join(prefix, entry)
          : entry;

        results.push({
          key,
          size: stat.size,
          contentType: '',
          lastModified: stat.mtime,
        });
      }
    } catch {
      // Directory doesn't exist yet
    }

    return results;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
}
