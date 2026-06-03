import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const SITE_API_KEY_HMAC_PREFIX = 'hmac:';

@Injectable()
export class PasswordService {
  private readonly rounds = 10;

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  hmacSign(plain: string): string {
    const secret = this.requireHmacSecret();
    const digest = createHmac('sha256', secret).update(plain).digest('hex');
    return `${SITE_API_KEY_HMAC_PREFIX}${digest}`;
  }

  hmacVerify(plain: string, stored: string): boolean {
    if (!stored.startsWith(SITE_API_KEY_HMAC_PREFIX)) {
      return false;
    }
    const secret = this.requireHmacSecret();
    const expected = createHmac('sha256', secret).update(plain).digest('hex');
    const actual = stored.slice(SITE_API_KEY_HMAC_PREFIX.length);
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  }

  isHmacHash(stored: string | null | undefined): boolean {
    return !!stored?.startsWith(SITE_API_KEY_HMAC_PREFIX);
  }

  private requireHmacSecret(): string {
    const secret = process.env.SITE_API_KEY_HMAC_SECRET?.trim();
    if (!secret) {
      throw new Error('SITE_API_KEY_HMAC_SECRET is not configured');
    }
    return secret;
  }
}
