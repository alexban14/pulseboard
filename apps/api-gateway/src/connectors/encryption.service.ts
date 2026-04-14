import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(config: ConfigService) {
    const keyHex = config.get<string>('ENCRYPTION_KEY');
    if (!keyHex || keyHex.length < 64) {
      // In dev, generate a deterministic key from JWT_SECRET
      const secret = config.get<string>('JWT_SECRET', 'dev-fallback');
      this.key = crypto.createHash('sha256').update(secret).digest();
    } else {
      this.key = Buffer.from(keyHex, 'hex');
    }
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    // Format: base64(iv + tag + ciphertext)
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(encoded: string): string {
    const data = Buffer.from(encoded, 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
  }
}
