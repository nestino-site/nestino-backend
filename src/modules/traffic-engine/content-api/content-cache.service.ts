import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

const CACHE_OP_TIMEOUT_MS = 800;

@Injectable()
export class ContentCacheService {
  private readonly logger = new Logger(ContentCacheService.name);

  constructor(private readonly redis: RedisService) {}

  cacheKey(siteId: number, slug: string): string {
    const normalized = slug.startsWith('/') ? slug : `/${slug}`;
    return `content:v2:${siteId}:${normalized}`;
  }

  pageIdCacheKey(pageId: number): string {
    return `content:v2:page:${pageId}`;
  }

  async getBySlug<T>(siteId: number, slug: string): Promise<T | null> {
    const raw = await this.safeGet(this.cacheKey(siteId, slug));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.invalidate(siteId, slug);
      return null;
    }
  }

  async getByPageId<T>(pageId: number): Promise<T | null> {
    const raw = await this.safeGet(this.pageIdCacheKey(pageId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.invalidatePageId(pageId);
      return null;
    }
  }

  async setBySlug(siteId: number, slug: string, payload: unknown): Promise<void> {
    await this.safeSet(this.cacheKey(siteId, slug), JSON.stringify(payload));
  }

  async setByPageId(pageId: number, payload: unknown): Promise<void> {
    await this.safeSet(this.pageIdCacheKey(pageId), JSON.stringify(payload));
  }

  async invalidate(siteId: number, slug: string): Promise<void> {
    await this.safeDel(this.cacheKey(siteId, slug));
  }

  async invalidatePageId(pageId: number): Promise<void> {
    await this.safeDel(this.pageIdCacheKey(pageId));
  }

  async invalidatePage(siteId: number, slug: string, pageId: number): Promise<void> {
    await Promise.all([
      this.invalidate(siteId, slug),
      this.invalidatePageId(pageId),
    ]);
  }

  private async safeGet(key: string): Promise<string | null> {
    try {
      return await Promise.race([
        this.redis.client.get(key),
        this.timeout<string | null>(null),
      ]);
    } catch (error) {
      this.logger.warn({ msg: 'content_cache_get_failed', key, error: String(error) });
      return null;
    }
  }

  private async safeSet(key: string, value: string): Promise<void> {
    try {
      await Promise.race([
        this.redis.client.set(key, value),
        this.timeout<void>(undefined),
      ]);
    } catch (error) {
      this.logger.warn({ msg: 'content_cache_set_failed', key, error: String(error) });
    }
  }

  private async safeDel(key: string): Promise<void> {
    try {
      await Promise.race([
        this.redis.client.del(key),
        this.timeout<void>(undefined),
      ]);
    } catch (error) {
      this.logger.warn({ msg: 'content_cache_del_failed', key, error: String(error) });
    }
  }

  private timeout<T>(fallback: T): Promise<T> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(fallback), CACHE_OP_TIMEOUT_MS);
    });
  }
}
