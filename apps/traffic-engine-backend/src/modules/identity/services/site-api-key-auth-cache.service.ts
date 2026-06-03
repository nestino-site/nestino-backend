import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

const AUTH_CACHE_TTL_SECONDS = 300;
const CACHE_OP_TIMEOUT_MS = 800;

@Injectable()
export class SiteApiKeyAuthCacheService {
  private readonly logger = new Logger(SiteApiKeyAuthCacheService.name);

  constructor(private readonly redis: RedisService) {}

  scopedCacheKey(apiKey: string, siteId: number): string {
    const digest = createHash('sha256').update(`${apiKey}:${siteId}`).digest('hex').slice(0, 32);
    return `auth:scoped:${digest}`;
  }

  pageCacheKey(apiKey: string, pageId: number): string {
    const digest = createHash('sha256').update(`${apiKey}:page:${pageId}`).digest('hex').slice(0, 32);
    return `auth:page:${digest}`;
  }

  async getScopedSiteId(apiKey: string, siteId: number): Promise<number | null> {
    const raw = await this.safeGet(this.scopedCacheKey(apiKey, siteId));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  async setScopedSiteId(apiKey: string, siteId: number): Promise<void> {
    await this.safeSetex(this.scopedCacheKey(apiKey, siteId), AUTH_CACHE_TTL_SECONDS, String(siteId));
  }

  async getPageSiteId(apiKey: string, pageId: number): Promise<number | null> {
    const raw = await this.safeGet(this.pageCacheKey(apiKey, pageId));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  async setPageSiteId(apiKey: string, pageId: number, siteId: number): Promise<void> {
    await this.safeSetex(this.pageCacheKey(apiKey, pageId), AUTH_CACHE_TTL_SECONDS, String(siteId));
  }

  private async safeGet(key: string): Promise<string | null> {
    try {
      return await Promise.race([
        this.redis.client.get(key),
        this.timeout<string | null>(null),
      ]);
    } catch (error) {
      this.logger.warn({ msg: 'auth_cache_get_failed', key, error: String(error) });
      return null;
    }
  }

  private async safeSetex(key: string, ttl: number, value: string): Promise<void> {
    try {
      await Promise.race([
        this.redis.client.setex(key, ttl, value),
        this.timeout<void>(undefined),
      ]);
    } catch (error) {
      this.logger.warn({ msg: 'auth_cache_set_failed', key, error: String(error) });
    }
  }

  private timeout<T>(fallback: T): Promise<T> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(fallback), CACHE_OP_TIMEOUT_MS);
    });
  }
}
