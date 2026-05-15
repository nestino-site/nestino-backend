import { Injectable } from '@nestjs/common';
import { CannibalizationStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SchemaMarkupService } from './schema-markup.service';

export interface QuickWinItem {
  query: string;
  pageId: number | null;
  pageSlug: string | null;
  avgPosition: number;
  impressions: number;
  clicks: number;
  ctr: number;
  expectedCtr: number;
  ctrGap: number;
  recommendedAction: string;
}

export interface CannibalizationItem {
  query: string;
  winnerPageId: number;
  winnerPageSlug: string | null;
  winnerReason: string;
  loserPages: { pageId: number; pageSlug: string | null; avgPosition: number; clicks: number }[];
  recommendedAction: string;
}

export interface KeywordOrphanItem {
  query: string;
  pageId: number | null;
  pageSlug: string | null;
  avgPosition: number;
  impressions: number;
  recommendation: string;
}

@Injectable()
export class SeoStrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schemaMarkupService: SchemaMarkupService,
  ) {}

  async findQuickWins(siteId: number): Promise<QuickWinItem[]> {
    const metrics = await this.prisma.seoMetric.findMany({
      where: {
        siteId,
        query: { not: null },
        avgPosition: { gte: 4, lte: 20 },
        impressions: { gt: 200 },
      },
      include: { page: { select: { id: true, slug: true } } },
      orderBy: [{ impressions: 'desc' }],
      take: 150,
    });

    const quickWins: QuickWinItem[] = [];
    for (const metric of metrics) {
      if (!metric.query || metric.avgPosition == null) continue;
      const expectedCtr = this.expectedCtr(metric.avgPosition);
      const ctrGap = metric.ctr - expectedCtr;
      if (ctrGap >= -0.015) continue;

      quickWins.push({
        query: metric.query,
        pageId: metric.pageId,
        pageSlug: metric.page?.slug ?? null,
        avgPosition: metric.avgPosition,
        impressions: metric.impressions,
        clicks: metric.clicks,
        ctr: metric.ctr,
        expectedCtr,
        ctrGap,
        recommendedAction: `Rewrite title/meta to match intent for "${metric.query}" on ${metric.page?.slug ?? 'target page'}`,
      });
    }

    return quickWins;
  }

  async findCannibalization(siteId: number): Promise<CannibalizationItem[]> {
    const metrics = await this.prisma.seoMetric.findMany({
      where: {
        siteId,
        query: { not: null },
        pageId: { not: null },
      },
      include: { page: { select: { id: true, slug: true } } },
      orderBy: [{ query: 'asc' }, { date: 'desc' }],
      take: 2000,
    });

    const byQuery = new Map<string, typeof metrics>();
    for (const metric of metrics) {
      if (!metric.query) continue;
      const list = byQuery.get(metric.query) ?? [];
      list.push(metric);
      byQuery.set(metric.query, list);
    }

    const results: CannibalizationItem[] = [];
    const pageStatuses = new Map<number, CannibalizationStatus>();

    for (const [query, rows] of byQuery.entries()) {
      const byPage = new Map<number, (typeof rows)[number][]>();
      for (const row of rows) {
        if (!row.pageId) continue;
        const list = byPage.get(row.pageId) ?? [];
        list.push(row);
        byPage.set(row.pageId, list);
      }
      if (byPage.size < 2) continue;

      const pageStats = [...byPage.entries()].map(([pageId, list]) => ({
        pageId,
        pageSlug: list[0].page?.slug ?? null,
        avgPosition: this.avg(list.map((m) => m.avgPosition).filter((v): v is number => v != null)),
        clicks: list.reduce((sum, m) => sum + m.clicks, 0),
      }));
      pageStats.sort((a, b) => (a.avgPosition - b.avgPosition) || (b.clicks - a.clicks));

      const winner = pageStats[0];
      const losers = pageStats.slice(1);
      const best = pageStats[0].avgPosition;
      const worst = pageStats[pageStats.length - 1].avgPosition;
      const allTopFive = pageStats.every((p) => p.avgPosition <= 5);
      const nearPositions = worst - best <= 2;
      const monitor = allTopFive && nearPositions;

      results.push({
        query,
        winnerPageId: winner.pageId,
        winnerPageSlug: winner.pageSlug,
        winnerReason: `best position (${winner.avgPosition.toFixed(2)})`,
        loserPages: losers,
        recommendedAction: monitor
          ? 'monitor: possible SERP domination'
          : 'consolidate: 301 redirect losers to winner or use canonical',
      });

      pageStatuses.set(winner.pageId, monitor ? CannibalizationStatus.MONITOR : CannibalizationStatus.WINNER);
      for (const loser of losers) {
        pageStatuses.set(loser.pageId, monitor ? CannibalizationStatus.MONITOR : CannibalizationStatus.LOSER);
      }
    }

    if (pageStatuses.size > 0) {
      await this.persistPageCannibalizationStatuses(pageStatuses);
    }
    return results;
  }

  async findKeywordOrphans(siteId: number): Promise<KeywordOrphanItem[]> {
    const metrics = await this.prisma.seoMetric.findMany({
      where: {
        siteId,
        query: { not: null },
        avgPosition: { gte: 4, lte: 20 },
        impressions: { gt: 100 },
      },
      include: { page: { select: { id: true, slug: true, title: true } } },
      orderBy: [{ impressions: 'desc' }],
      take: 300,
    });

    const orphans: KeywordOrphanItem[] = [];
    for (const metric of metrics) {
      if (!metric.query || metric.avgPosition == null) continue;
      const normalizedQuery = metric.query.toLowerCase().trim();
      const slug = metric.page?.slug?.toLowerCase() ?? '';
      const title = metric.page?.title?.toLowerCase() ?? '';
      if (slug.includes(normalizedQuery) || title.includes(normalizedQuery)) {
        continue;
      }
      orphans.push({
        query: metric.query,
        pageId: metric.pageId,
        pageSlug: metric.page?.slug ?? null,
        avgPosition: metric.avgPosition,
        impressions: metric.impressions,
        recommendation: `Create a dedicated page targeting "${metric.query}" (currently ranking from ${metric.page?.slug ?? 'a non-dedicated page'})`,
      });
    }
    return orphans;
  }

  async findGeoScores(siteId: number): Promise<{ pageId: number; slug: string; geoScore: number }[]> {
    const pages = await this.prisma.page.findMany({
      where: { siteId, geoScore: { not: null } },
      select: { id: true, slug: true, geoScore: true },
      orderBy: { geoScore: 'asc' },
    });
    return pages.map((p) => ({ pageId: p.id, slug: p.slug, geoScore: p.geoScore ?? 0 }));
  }

  async generateSchemaForPage(pageId: number): Promise<unknown> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: {
        keyword: true,
        site: true,
      },
    });
    if (!page) {
      return null;
    }

    const schema = this.schemaMarkupService.generate({
      slug: page.slug,
      title: page.title,
      metaDescription: page.metaDescription,
      finalContent: page.finalContent,
      keyword: page.keyword.keyword,
      intent: page.keyword.intent,
      domain: page.site.domain,
      siteName: page.site.name,
    });

    await this.prisma.page.update({
      where: { id: pageId },
      data: { schemaMarkup: schema },
    });

    return schema;
  }

  private expectedCtr(avgPosition: number): number {
    if (avgPosition <= 1) return 0.27;
    if (avgPosition <= 2) return 0.15;
    if (avgPosition <= 3) return 0.11;
    if (avgPosition <= 4) return 0.08;
    if (avgPosition <= 5) return 0.06;
    if (avgPosition <= 10) return 0.03;
    return 0.01;
  }

  private avg(values: number[]): number {
    if (values.length === 0) return 100;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private async persistPageCannibalizationStatuses(statuses: Map<number, CannibalizationStatus>): Promise<void> {
    await this.prisma.$transaction(
      [...statuses.entries()].map(([pageId, status]) =>
        this.prisma.page.update({
          where: { id: pageId },
          data: { cannibalizationStatus: status },
        }),
      ),
    );
  }
}
