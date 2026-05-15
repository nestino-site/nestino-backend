import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PasswordService } from './password.service';

export interface GeneratedSiteApiKey {
  plaintext: string;
  hash: string;
}

@Injectable()
export class SiteApiKeyService {
  constructor(private readonly passwordService: PasswordService) {}

  async generateWithHash(): Promise<GeneratedSiteApiKey> {
    const plaintext = randomBytes(32).toString('base64url');
    const hash = await this.passwordService.hash(plaintext);
    return { plaintext, hash };
  }

  async verify(plaintext: string, hash: string | null | undefined): Promise<boolean> {
    if (!plaintext || !hash) {
      return false;
    }
    return this.passwordService.compare(plaintext, hash);
  }
}
