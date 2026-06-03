import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PasswordService } from './password.service';

export interface GeneratedSiteApiKey {
  plaintext: string;
  hash: string;
}

export interface SiteApiKeyVerifyResult {
  valid: boolean;
  /** When bcrypt verified successfully, caller should persist HMAC hash. */
  upgradedHash?: string;
}

@Injectable()
export class SiteApiKeyService {
  constructor(private readonly passwordService: PasswordService) {}

  async generateWithHash(): Promise<GeneratedSiteApiKey> {
    const plaintext = randomBytes(32).toString('base64url');
    try {
      const hash = this.passwordService.hmacSign(plaintext);
      return { plaintext, hash };
    } catch {
      const hash = await this.passwordService.hash(plaintext);
      return { plaintext, hash };
    }
  }

  async verify(plaintext: string, hash: string | null | undefined): Promise<boolean> {
    const result = await this.verifyDetailed(plaintext, hash);
    return result.valid;
  }

  async verifyDetailed(
    plaintext: string,
    hash: string | null | undefined,
  ): Promise<SiteApiKeyVerifyResult> {
    if (!plaintext || !hash) {
      return { valid: false };
    }

    if (this.passwordService.isHmacHash(hash)) {
      return { valid: this.passwordService.hmacVerify(plaintext, hash) };
    }

    const valid = await this.passwordService.compare(plaintext, hash);
    if (!valid) {
      return { valid: false };
    }

    try {
      return {
        valid: true,
        upgradedHash: this.passwordService.hmacSign(plaintext),
      };
    } catch {
      return { valid: true };
    }
  }
}
