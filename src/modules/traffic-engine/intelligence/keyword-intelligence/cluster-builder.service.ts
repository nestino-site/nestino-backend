import { Injectable, Logger } from '@nestjs/common';
import { ContentLanguage, KeywordIntent } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { RedisService } from '../../../../common/redis/redis.service';
import { KeywordIntentClassifierService } from '../keyword-intent-classifier.service';
import { ClusterKeyword, KeywordClusterData } from './keyword-cluster.types';
import { SemanticExpansionService } from './semantic-expansion.service';

const CACHE_TTL = 3600 * 6; // 6 hours — clusters are stable
const MAX_SECONDARY = 8;

@Injectable()
export class ClusterBuilderService {
  private readonly logger = new Logger(ClusterBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly intentClassifier: KeywordIntentClassifierService,
    private readonly semanticExpansion: SemanticExpansionService,
  ) {}

  async buildCluster(primaryKeywordId: string, siteId: string): Promise<KeywordClusterData> {
    const cacheKey = `cluster:${primaryKeywordId}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as KeywordClusterData;
    }

    const primary = await this.prisma.keyword.findUnique({ where: { id: primaryKeywordId } });
    if (!primary) {
      throw new Error(`Primary keyword ${primaryKeywordId} not found`);
    }

    const intent = await this.intentClassifier.classify(primary.keyword, primary.language);
    const semanticTopics = await this.semanticExpansion.expand(primary.keyword, intent, primary.language);

    // Check if a cluster already exists in DB and is fresh enough
    const existingCluster = await this.prisma.keywordCluster.findUnique({
      where: { mainKeywordId: primaryKeywordId },
    });

    let secondaryKeywords: ClusterKeyword[] = [];

    if (existingCluster && existingCluster.secondaryKeywordIds.length > 0) {
      secondaryKeywords = await this.loadSecondaryKeywords(existingCluster.secondaryKeywordIds);
    } else {
      secondaryKeywords = await this.findRelatedKeywords(
        primary.keyword,
        primary.language,
        intent,
        siteId,
        primaryKeywordId,
      );
    }

    const topic = this.deriveTopic(primary.keyword, intent);

    // Upsert the cluster to DB
    const dbCluster = await this.prisma.keywordCluster.upsert({
      where: { mainKeywordId: primaryKeywordId },
      create: {
        siteId,
        mainKeywordId: primaryKeywordId,
        intent,
        topic,
        semanticTopics,
        secondaryKeywordIds: secondaryKeywords.map((k) => k.id),
      },
      update: {
        intent,
        topic,
        semanticTopics,
        secondaryKeywordIds: secondaryKeywords.map((k) => k.id),
      },
    });

    const clusterData: KeywordClusterData = {
      id: dbCluster.id,
      siteId,
      mainKeywordId: primaryKeywordId,
      primaryKeyword: primary.keyword,
      language: primary.language,
      intent,
      topic,
      secondaryKeywords,
      semanticTopics,
    };

    await this.redis.client.setex(cacheKey, CACHE_TTL, JSON.stringify(clusterData));
    this.logger.log({
      msg: 'cluster_built',
      primaryKeywordId,
      secondary: secondaryKeywords.length,
      semanticTopics: semanticTopics.length,
    });

    return clusterData;
  }

  async invalidateCache(primaryKeywordId: string): Promise<void> {
    await this.redis.client.del(`cluster:${primaryKeywordId}`);
  }

  private async findRelatedKeywords(
    primaryKeyword: string,
    language: ContentLanguage,
    intent: KeywordIntent,
    siteId: string,
    excludeId: string,
  ): Promise<ClusterKeyword[]> {
    // Find keywords with same intent first, fallback to same language
    const candidates = await this.prisma.keyword.findMany({
      where: {
        siteId,
        language,
        id: { not: excludeId },
        intent: { in: this.getRelatedIntents(intent) },
      },
      orderBy: [{ priority: 'desc' }, { searchVolume: 'desc' }],
      take: MAX_SECONDARY * 2,
    });

    return candidates
      .map((kw) => ({
        id: kw.id,
        keyword: kw.keyword,
        language: kw.language,
        weight: this.computeWeight(kw.keyword, primaryKeyword, kw.priority, kw.searchVolume),
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_SECONDARY);
  }

  private async loadSecondaryKeywords(ids: string[]): Promise<ClusterKeyword[]> {
    const keywords = await this.prisma.keyword.findMany({ where: { id: { in: ids } } });
    return keywords.map((kw) => ({
      id: kw.id,
      keyword: kw.keyword,
      language: kw.language,
      weight: 0.5,
    }));
  }

  private computeWeight(
    keyword: string,
    primaryKeyword: string,
    priority: number,
    searchVolume: number | null,
  ): number {
    const primaryWords = new Set(primaryKeyword.toLowerCase().split(/\s+/));
    const candidateWords = keyword.toLowerCase().split(/\s+/);
    const overlap = candidateWords.filter((w) => primaryWords.has(w)).length;
    const overlapScore = Math.min(1, overlap / Math.max(1, primaryWords.size));

    const priorityScore = Math.min(1, priority / 10);
    const volumeScore = searchVolume ? Math.min(1, searchVolume / 10000) : 0.3;

    return Number((overlapScore * 0.5 + priorityScore * 0.3 + volumeScore * 0.2).toFixed(2));
  }

  private getRelatedIntents(intent: KeywordIntent): KeywordIntent[] {
    // Include same intent and complementary intents
    if (intent === KeywordIntent.COMMERCIAL) {
      return [KeywordIntent.COMMERCIAL, KeywordIntent.TRANSACTIONAL];
    }
    if (intent === KeywordIntent.TRANSACTIONAL) {
      return [KeywordIntent.TRANSACTIONAL, KeywordIntent.COMMERCIAL];
    }
    return [intent, KeywordIntent.INFORMATIONAL];
  }

  private deriveTopic(keyword: string, intent: KeywordIntent): string {
    const words = keyword.toLowerCase().split(/\s+/);
    // Use the last 2-3 meaningful words as topic
    const core = words.filter((w) => w.length > 3).slice(0, 3).join(' ');
    const intentLabel = intent.toLowerCase();
    return `${core} (${intentLabel})`;
  }
}
