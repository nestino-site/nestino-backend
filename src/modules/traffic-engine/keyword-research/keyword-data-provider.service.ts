import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage } from '@prisma/client';

export interface KeywordDataResult {
  searchVolume?: number;
  difficulty?: number;
  relatedKeywords: string[];
  source: 'serpapi' | 'heuristic';
}

/**
 * Optional SerpAPI integration for real search volume and related queries.
 * Set SERPAPI_API_KEY to enable; otherwise returns heuristic expansions.
 */
@Injectable()
export class KeywordDataProviderService {
  private readonly logger = new Logger(KeywordDataProviderService.name);

  async enrichSeedKeyword(
    keyword: string,
    language: ContentLanguage,
    country = 'us',
  ): Promise<KeywordDataResult> {
    const apiKey = process.env.SERPAPI_API_KEY?.trim();
    if (!apiKey) {
      return {
        relatedKeywords: this.heuristicRelated(keyword),
        source: 'heuristic',
      };
    }

    try {
      const params = new URLSearchParams({
        engine: 'google',
        q: keyword,
        api_key: apiKey,
        hl: language.toLowerCase(),
        gl: country,
      });
      const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
        signal: AbortSignal.timeout(Number(process.env.SERPAPI_TIMEOUT_MS ?? 8000)),
      });
      if (!res.ok) {
        throw new Error(`SerpAPI HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        related_questions?: Array<{ question?: string }>;
        related_searches?: Array<{ query?: string }>;
      };

      const related: string[] = [];
      for (const q of data.related_questions ?? []) {
        if (q.question?.trim()) {
          related.push(q.question.trim());
        }
      }
      for (const r of data.related_searches ?? []) {
        if (r.query?.trim()) {
          related.push(r.query.trim());
        }
      }

      return {
        relatedKeywords: [...new Set(related)].slice(0, 15),
        source: 'serpapi',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'serpapi_failed', keyword, error: message });
      return {
        relatedKeywords: this.heuristicRelated(keyword),
        source: 'heuristic',
      };
    }
  }

  private heuristicRelated(keyword: string): string[] {
    const base = keyword.trim();
    return [
      `${base} guide`,
      `${base} tips`,
      `best ${base}`,
      `${base} cost`,
      `${base} reviews`,
    ].filter((k, i, arr) => arr.indexOf(k) === i);
  }
}
