import { Injectable } from '@nestjs/common';
import { KeywordIntent } from '@prisma/client';
import { RedisService } from '../../../../common/redis/redis.service';

const CACHE_TTL = 3600;

@Injectable()
export class SemanticExpansionService {
  constructor(private readonly redis: RedisService) {}

  async expand(keyword: string, intent: KeywordIntent, language: string): Promise<string[]> {
    const cacheKey = `semantic:${keyword.toLowerCase()}:${language.toLowerCase()}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as string[];
    }

    const topics = this.buildTopics(keyword, intent);
    await this.redis.client.setex(cacheKey, CACHE_TTL, JSON.stringify(topics));
    return topics;
  }

  private buildTopics(keyword: string, intent: KeywordIntent): string[] {
    const base = keyword.toLowerCase().trim();
    const words = base.split(/\s+/);
    const core = words.slice(-2).join(' ');

    const shared = [
      `${base} guide`,
      `${base} tips`,
      `how to choose ${core}`,
      `${core} overview`,
    ];

    if (intent === KeywordIntent.TRANSACTIONAL) {
      return [
        ...shared,
        `${base} price`,
        `${base} booking`,
        `${base} deals`,
        `cheap ${core}`,
        `${core} offers`,
      ].slice(0, 8);
    }

    if (intent === KeywordIntent.COMMERCIAL) {
      return [
        ...shared,
        `best ${core}`,
        `top ${core}`,
        `${base} review`,
        `${base} comparison`,
        `${core} alternatives`,
      ].slice(0, 8);
    }

    if (intent === KeywordIntent.NAVIGATIONAL) {
      return [
        ...shared,
        `${core} official`,
        `${core} website`,
        `${core} contact`,
        `${core} location`,
      ].slice(0, 8);
    }

    // INFORMATIONAL default
    return [
      ...shared,
      `what is ${core}`,
      `${base} explained`,
      `${core} benefits`,
      `${core} vs alternatives`,
    ].slice(0, 8);
  }
}
