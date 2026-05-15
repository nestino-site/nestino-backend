import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface SerpOrganicResult {
  title: string;
  snippet: string;
  link: string;
}

export interface KeywordDataResult {
  searchVolume?: number;
  difficulty?: number;
  relatedKeywords: string[];
  paaQuestions: string[];
  organicResults: SerpOrganicResult[];
  entities: string[];
  hasAiOverview: boolean;
  hasFaqFeature: boolean;
  hasVideoFeature: boolean;
  hasImagePack: boolean;
  source: 'serpapi' | 'heuristic';
}

/** Stale-after (ms) before a fresh SerpAPI call is worth making for the same keyword. */
const SERP_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Full SERP intelligence provider. Fetches organic titles/snippets, PAA,
 * related searches, KG entities, and feature flags from SerpAPI.
 * Persists results in SerpSnapshot for reuse by brief builder and cluster builder.
 * Falls back to heuristics when SERPAPI_API_KEY is absent.
 */
@Injectable()
export class KeywordDataProviderService {
  private readonly logger = new Logger(KeywordDataProviderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enrichSeedKeyword(
    keyword: string,
    language: ContentLanguage,
    country = 'us',
  ): Promise<KeywordDataResult> {
    // Check cache first
    const cached = await this.getCachedSnapshot(keyword, language, country);
    if (cached) {
      return this.snapshotToResult(cached);
    }

    const apiKey = process.env.SERPAPI_API_KEY?.trim();
    if (!apiKey) {
      const heuristic = this.heuristicResult(keyword);
      await this.persistSnapshot(keyword, language, country, heuristic);
      return heuristic;
    }

    try {
      const result = await this.fetchFromSerpApi(keyword, language, country, apiKey);
      await this.persistSnapshot(keyword, language, country, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'serpapi_failed', keyword, error: message });
      const heuristic = this.heuristicResult(keyword);
      await this.persistSnapshot(keyword, language, country, heuristic);
      return heuristic;
    }
  }

  /** Fetch the latest snapshot for external use (brief builder, pipeline). */
  async getSnapshot(keyword: string, language: ContentLanguage, country = 'us') {
    return this.prisma.serpSnapshot.findUnique({
      where: { keyword_language_country: { keyword, language: language.toLowerCase(), country } },
    });
  }

  private async getCachedSnapshot(keyword: string, language: ContentLanguage, country: string) {
    const snap = await this.prisma.serpSnapshot.findUnique({
      where: { keyword_language_country: { keyword, language: language.toLowerCase(), country } },
    });
    if (!snap) return null;
    const age = Date.now() - snap.capturedAt.getTime();
    return age < SERP_CACHE_TTL_MS ? snap : null;
  }

  private snapshotToResult(snap: {
    organicTitles: string[];
    organicSnippets: string[];
    organicLinks: string[];
    paaQuestions: string[];
    relatedSearches: string[];
    entities: string[];
    searchVolume: number | null;
    difficulty: number | null;
    hasAiOverview: boolean;
    hasFaqFeature: boolean;
    hasVideoFeature: boolean;
    hasImagePack: boolean;
  }): KeywordDataResult {
    return {
      searchVolume: snap.searchVolume ?? undefined,
      difficulty: snap.difficulty ?? undefined,
      relatedKeywords: [...snap.relatedSearches, ...snap.paaQuestions].slice(0, 15),
      paaQuestions: snap.paaQuestions,
      organicResults: snap.organicTitles.map((t, i) => ({
        title: t,
        snippet: snap.organicSnippets[i] ?? '',
        link: snap.organicLinks[i] ?? '',
      })),
      entities: snap.entities,
      hasAiOverview: snap.hasAiOverview,
      hasFaqFeature: snap.hasFaqFeature,
      hasVideoFeature: snap.hasVideoFeature,
      hasImagePack: snap.hasImagePack,
      source: 'serpapi',
    };
  }

  private async fetchFromSerpApi(
    keyword: string,
    language: ContentLanguage,
    country: string,
    apiKey: string,
  ): Promise<KeywordDataResult> {
    const params = new URLSearchParams({
      engine: 'google',
      q: keyword,
      api_key: apiKey,
      hl: language.toLowerCase(),
      gl: country,
      num: '10',
    });

    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: AbortSignal.timeout(Number(process.env.SERPAPI_TIMEOUT_MS ?? 8000)),
    });

    if (!res.ok) {
      throw new Error(`SerpAPI HTTP ${res.status}`);
    }

    const data = (await res.json()) as SerpApiResponse;

    // Organic results (top 10)
    const organicResults: SerpOrganicResult[] = (data.organic_results ?? []).slice(0, 10).map((r) => ({
      title: r.title ?? '',
      snippet: r.snippet ?? '',
      link: r.link ?? '',
    }));

    // People Also Ask
    const paaQuestions = (data.related_questions ?? [])
      .map((q) => q.question ?? '')
      .filter(Boolean)
      .slice(0, 8);

    // Related searches
    const relatedSearches = (data.related_searches ?? [])
      .map((r) => r.query ?? '')
      .filter(Boolean)
      .slice(0, 10);

    // Knowledge graph entities
    const entities: string[] = [];
    if (data.knowledge_graph) {
      const kg = data.knowledge_graph;
      if (kg.title) entities.push(kg.title);
      if (kg.type) entities.push(kg.type);
      for (const fact of (kg.known_attributes ?? []).slice(0, 5)) {
        if (fact.name) entities.push(fact.name);
      }
    }

    // SERP feature flags
    const hasAiOverview = !!(data.ai_overview ?? data.answer_box);
    const hasFaqFeature = !!(data.related_questions?.length);
    const hasVideoFeature = !!(data.inline_videos?.length || data.video_results?.length);
    const hasImagePack = !!(data.inline_images?.length);

    return {
      relatedKeywords: [...relatedSearches, ...paaQuestions].slice(0, 15),
      paaQuestions,
      organicResults,
      entities,
      hasAiOverview,
      hasFaqFeature,
      hasVideoFeature,
      hasImagePack,
      source: 'serpapi',
    };
  }

  private async persistSnapshot(
    keyword: string,
    language: ContentLanguage,
    country: string,
    result: KeywordDataResult,
  ): Promise<void> {
    const data = {
      keyword,
      language: language.toLowerCase(),
      country,
      organicTitles: result.organicResults.map((r) => r.title),
      organicSnippets: result.organicResults.map((r) => r.snippet),
      organicLinks: result.organicResults.map((r) => r.link),
      paaQuestions: result.paaQuestions,
      relatedSearches: result.relatedKeywords.filter((k) =>
        !result.paaQuestions.includes(k),
      ),
      entities: result.entities,
      searchVolume: result.searchVolume ?? null,
      difficulty: result.difficulty ?? null,
      hasAiOverview: result.hasAiOverview,
      hasFaqFeature: result.hasFaqFeature,
      hasVideoFeature: result.hasVideoFeature,
      hasImagePack: result.hasImagePack,
      capturedAt: new Date(),
    };

    await this.prisma.serpSnapshot.upsert({
      where: { keyword_language_country: { keyword, language: language.toLowerCase(), country } },
      create: data,
      update: data,
    });
  }

  private heuristicResult(keyword: string): KeywordDataResult {
    const base = keyword.trim();
    return {
      relatedKeywords: [
        `${base} guide`,
        `${base} tips`,
        `best ${base}`,
        `${base} cost`,
        `${base} reviews`,
      ],
      paaQuestions: [
        `What is the best ${base}?`,
        `How to choose ${base}?`,
        `Is ${base} worth it?`,
      ],
      organicResults: [],
      entities: [],
      hasAiOverview: false,
      hasFaqFeature: false,
      hasVideoFeature: false,
      hasImagePack: false,
      source: 'heuristic',
    };
  }
}

interface SerpApiResponse {
  organic_results?: Array<{ title?: string; snippet?: string; link?: string }>;
  related_questions?: Array<{ question?: string; answer?: string }>;
  related_searches?: Array<{ query?: string }>;
  knowledge_graph?: {
    title?: string;
    type?: string;
    known_attributes?: Array<{ name?: string; value?: string }>;
  };
  answer_box?: unknown;
  ai_overview?: unknown;
  inline_videos?: unknown[];
  video_results?: unknown[];
  inline_images?: unknown[];
}
