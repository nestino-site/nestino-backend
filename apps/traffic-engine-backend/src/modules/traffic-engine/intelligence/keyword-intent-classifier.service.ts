import { Injectable } from '@nestjs/common';
import { KeywordIntent } from '@prisma/client';
import { RedisService } from '../../../common/redis/redis.service';

@Injectable()
export class KeywordIntentClassifierService {
  constructor(private readonly redis: RedisService) {}

  async classify(keyword: string, language: string): Promise<KeywordIntent> {
    const cacheKey = `intent:${keyword.toLowerCase()}:${language.toLowerCase()}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      return cached as KeywordIntent;
    }

    const normalized = keyword.toLowerCase();
    let intent: KeywordIntent = KeywordIntent.INFORMATIONAL;
    if (this.containsAny(normalized, ['buy', 'price', 'deal', 'booking', 'book', 'order'])) {
      intent = KeywordIntent.TRANSACTIONAL;
    } else if (this.containsAny(normalized, ['official', 'login', 'website', 'homepage'])) {
      intent = KeywordIntent.NAVIGATIONAL;
    } else if (this.containsAny(normalized, ['best', 'top', 'compare', 'review', 'vs'])) {
      intent = KeywordIntent.COMMERCIAL;
    }

    await this.redis.client.setex(cacheKey, 3600, intent);
    return intent;
  }

  private containsAny(value: string, terms: string[]): boolean {
    return terms.some((term) => value.includes(term));
  }
}
