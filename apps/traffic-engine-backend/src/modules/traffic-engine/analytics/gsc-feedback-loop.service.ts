import { Injectable, Logger } from '@nestjs/common';
import {
  ContentLanguage,
  IdeaStatus,
  KeywordResearchSource,
  KeywordStatus,
  SubjectStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { KeywordDataProviderService } from '../keyword-research/keyword-data-provider.service';
import { SeoStrategyService } from '../seo-strategy/seo-strategy.service';
import { TrendScoringService, TrendWinner } from './trend-scoring.service';

export interface GscFeedbackResult {
  keywordResearchCreated: number;
  contentIdeasCreated: number;
  queriesProcessed: number;
}

const GSC_SUBJECT_TITLE = 'GSC Opportunities';

@Injectable()
export class GscFeedbackLoopService {
  private readonly logger = new Logger(GscFeedbackLoopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trendScoring: TrendScoringService,
    private readonly seoStrategy: SeoStrategyService,
    private readonly keywordData: KeywordDataProviderService,
  ) {}

  async previewSeeds(siteId: number) {
    const maxIdeas = Number(process.env.GSC_FEEDBACK_MAX_IDEAS_PER_SYNC ?? 10);
    const winners = await this.trendScoring.findWinners(siteId, maxIdeas);
    const orphans = (await this.seoStrategy.findKeywordOrphans(siteId)).slice(0, maxIdeas);
    return {
      winners,
      orphans,
      merged: this.mergeSeeds(winners, orphans).slice(0, maxIdeas),
    };
  }

  async processSite(siteId: number): Promise<GscFeedbackResult> {
    const maxIdeas = Number(process.env.GSC_FEEDBACK_MAX_IDEAS_PER_SYNC ?? 10);
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { defaultLanguage: true },
    });
    if (!site) {
      return { keywordResearchCreated: 0, contentIdeasCreated: 0, queriesProcessed: 0 };
    }

    const winners = await this.trendScoring.findWinners(siteId, maxIdeas);
    const orphans = (await this.seoStrategy.findKeywordOrphans(siteId)).slice(0, maxIdeas);
    const seeds = this.mergeSeeds(winners, orphans).slice(0, maxIdeas);

    if (seeds.length === 0) {
      return { keywordResearchCreated: 0, contentIdeasCreated: 0, queriesProcessed: 0 };
    }

    const subjectId = await this.ensureGscSubject(siteId, site.defaultLanguage);
    let keywordResearchCreated = 0;
    let contentIdeasCreated = 0;

    for (const seed of seeds) {
      const query = seed.query.trim();
      if (!query) continue;

      const existingKeyword = await this.prisma.keyword.findFirst({
        where: { siteId, keyword: query, language: site.defaultLanguage },
      });
      const existingIdea = await this.prisma.contentIdea.findFirst({
        where: { subjectId, targetKeyword: query },
      });
      if (existingKeyword && existingIdea) {
        continue;
      }

      const enriched = await this.keywordData.enrichSeedKeyword(query, site.defaultLanguage);
      const suggestions = [
        ...new Set([
          query,
          ...enriched.relatedKeywords.slice(0, 8),
          ...enriched.paaQuestions.slice(0, 3),
        ]),
      ].filter(Boolean);

      const existingResearch = await this.prisma.keywordResearch.findFirst({
        where: { seedKeyword: query, language: site.defaultLanguage, source: KeywordResearchSource.GSC },
      });
      if (!existingResearch) {
        await this.prisma.keywordResearch.create({
          data: {
            seedKeyword: query,
            language: site.defaultLanguage,
            suggestions,
            source: KeywordResearchSource.GSC,
          },
        });
        keywordResearchCreated++;
      }

      if (!existingKeyword) {
        await this.prisma.keyword.create({
          data: {
            siteId,
            keyword: query,
            language: site.defaultLanguage,
            status: KeywordStatus.PENDING,
            priority: Math.round(seed.score),
            notes: JSON.stringify({
              source: 'gsc',
              reason: seed.reason,
              impressions: seed.impressions,
              avgPosition: seed.avgPosition,
              enrichedAt: new Date().toISOString(),
            }),
          },
        });
      }

      if (!existingIdea) {
        const slug = this.slugify(query);
        await this.prisma.contentIdea.create({
          data: {
            subjectId,
            title: this.titleFromQuery(query),
            slug,
            targetKeyword: query,
            metaDescription: `Dedicated page targeting "${query}" — surfaced from Google Search Console ${seed.reason}.`,
            headings: suggestions.slice(0, 5).map((s) => this.titleFromQuery(s)),
            internalLinkingSuggestions: [],
            confidenceScore: Math.min(0.95, 0.4 + seed.score / 100),
            status: IdeaStatus.PENDING_REVIEW,
            reviewNotes: `Auto-created from GSC ${seed.reason}. Approve to generate a dedicated page.`,
          },
        });
        contentIdeasCreated++;
      }
    }

    this.logger.log({
      msg: 'gsc_feedback_loop_complete',
      siteId,
      keywordResearchCreated,
      contentIdeasCreated,
      queriesProcessed: seeds.length,
    });

    return { keywordResearchCreated, contentIdeasCreated, queriesProcessed: seeds.length };
  }

  private mergeSeeds(
    winners: TrendWinner[],
    orphans: Awaited<ReturnType<SeoStrategyService['findKeywordOrphans']>>,
  ): Array<{ query: string; reason: string; score: number; impressions: number; avgPosition: number }> {
    const byQuery = new Map<
      string,
      { query: string; reason: string; score: number; impressions: number; avgPosition: number }
    >();

    for (const winner of winners) {
      byQuery.set(winner.query, {
        query: winner.query,
        reason: winner.source,
        score: winner.trendScore,
        impressions: winner.recentImpressions,
        avgPosition: winner.recentAvgPosition,
      });
    }

    for (const orphan of orphans) {
      const existing = byQuery.get(orphan.query);
      const score = orphan.impressions * 0.1 + (21 - orphan.avgPosition);
      if (!existing || score > existing.score) {
        byQuery.set(orphan.query, {
          query: orphan.query,
          reason: 'orphan',
          score,
          impressions: orphan.impressions,
          avgPosition: orphan.avgPosition,
        });
      }
    }

    return [...byQuery.values()].sort((a, b) => b.score - a.score);
  }

  private async ensureGscSubject(siteId: number, language: ContentLanguage): Promise<number> {
    const existing = await this.prisma.subject.findFirst({
      where: { siteId, title: GSC_SUBJECT_TITLE },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    const created = await this.prisma.subject.create({
      data: {
        siteId,
        title: GSC_SUBJECT_TITLE,
        description:
          'Auto-generated content opportunities from Google Search Console winners and keyword orphans.',
        primaryKeywords: [],
        secondaryKeywords: [],
        language,
        seoGoal: 'Expand topical coverage based on proven GSC performance signals',
        status: SubjectStatus.ACTIVE,
      },
    });
    return created.id;
  }

  private slugify(query: string): string {
    const base = query
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
    return base || 'gsc-opportunity';
  }

  private titleFromQuery(query: string): string {
    return query
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
