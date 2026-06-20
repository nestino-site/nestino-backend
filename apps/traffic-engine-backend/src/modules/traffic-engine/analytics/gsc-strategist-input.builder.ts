import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface GscStrategistQueryCandidate {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
  ctrGap: number;
  pageId: number | null;
  pageSlug: string | null;
  pageTitle: string | null;
  isOrphan: boolean;
  hasDedicatedPage: boolean;
}

export interface GscStrategistExistingPage {
  slug: string;
  title: string;
  status: string;
}

export interface GscStrategistInputPayload {
  site: { id: number; name: string; domain: string };
  lookbackDays: number;
  candidates: GscStrategistQueryCandidate[];
  existingPages: GscStrategistExistingPage[];
}

@Injectable()
export class GscStrategistInputBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(siteId: number): Promise<GscStrategistInputPayload> {
    const lookbackDays = Number(process.env.GSC_LOOKBACK_DAYS ?? 28);
    const minImpressions = Number(process.env.GSC_STRATEGIST_MIN_IMPRESSIONS ?? 50);
    const minPosition = Number(process.env.GSC_STRATEGIST_MIN_POSITION ?? 5);
    const maxPosition = Number(process.env.GSC_STRATEGIST_MAX_POSITION ?? 30);
    const maxCandidates = Number(process.env.GSC_STRATEGIST_MAX_CANDIDATES ?? 80);
    const brandTerms = this.loadBrandTerms();

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, domain: true },
    });
    if (!site) {
      return {
        site: { id: siteId, name: '', domain: '' },
        lookbackDays,
        candidates: [],
        existingPages: [],
      };
    }

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - lookbackDays);

    const [metrics, existingPages] = await Promise.all([
      this.prisma.seoMetric.findMany({
        where: {
          siteId,
          query: { not: null },
          date: { gte: windowStart },
        },
        include: { page: { select: { id: true, slug: true, title: true } } },
      }),
      this.prisma.page.findMany({
        where: { siteId },
        select: { slug: true, title: true, status: true },
        orderBy: { slug: 'asc' },
      }),
    ]);

    const byQuery = this.aggregateByQuery(metrics);
    const candidates = [...byQuery.values()]
      .filter((row) => this.isEligibleCandidate(row, {
        minImpressions,
        minPosition,
        maxPosition,
        brandTerms,
      }))
      .sort((a, b) => this.scoreCandidate(b) - this.scoreCandidate(a))
      .slice(0, maxCandidates);

    return {
      site,
      lookbackDays,
      candidates,
      existingPages: existingPages.map((page) => ({
        slug: page.slug,
        title: page.title ?? '',
        status: page.status,
      })),
    };
  }

  aggregateByQuery(
    metrics: Array<{
      query: string | null;
      impressions: number;
      clicks: number;
      ctr: number;
      avgPosition: number | null;
      pageId: number | null;
      page: { id: number; slug: string; title: string | null } | null;
    }>,
  ): Map<string, GscStrategistQueryCandidate> {
    const grouped = new Map<
      string,
      {
        impressions: number;
        clicks: number;
        positionWeightedSum: number;
        positionWeight: number;
        bestPage: { pageId: number | null; pageSlug: string | null; pageTitle: string | null; impressions: number };
      }
    >();

    for (const metric of metrics) {
      if (!metric.query?.trim()) continue;
      const query = metric.query.trim();
      const impressions = metric.impressions ?? 0;
      const clicks = metric.clicks ?? 0;
      const position = metric.avgPosition ?? 100;

      const bucket =
        grouped.get(query) ??
        {
          impressions: 0,
          clicks: 0,
          positionWeightedSum: 0,
          positionWeight: 0,
          bestPage: {
            pageId: null,
            pageSlug: null,
            pageTitle: null,
            impressions: 0,
          },
        };

      bucket.impressions += impressions;
      bucket.clicks += clicks;
      if (impressions > 0 && metric.avgPosition != null) {
        bucket.positionWeightedSum += metric.avgPosition * impressions;
        bucket.positionWeight += impressions;
      }

      if (impressions > bucket.bestPage.impressions) {
        bucket.bestPage = {
          pageId: metric.pageId,
          pageSlug: metric.page?.slug ?? null,
          pageTitle: metric.page?.title ?? null,
          impressions,
        };
      }

      grouped.set(query, bucket);
    }

    const result = new Map<string, GscStrategistQueryCandidate>();
    for (const [query, bucket] of grouped.entries()) {
      const avgPosition =
        bucket.positionWeight > 0 ? bucket.positionWeightedSum / bucket.positionWeight : 100;
      const ctr = bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0;
      const expectedCtr = this.expectedCtr(avgPosition);
      const ctrGap = ctr - expectedCtr;
      const normalizedQuery = query.toLowerCase();
      const slug = bucket.bestPage.pageSlug?.toLowerCase() ?? '';
      const title = bucket.bestPage.pageTitle?.toLowerCase() ?? '';
      const hasDedicatedPage = slug.includes(normalizedQuery) || title.includes(normalizedQuery);

      result.set(query, {
        query,
        impressions: bucket.impressions,
        clicks: bucket.clicks,
        ctr,
        avgPosition,
        ctrGap,
        pageId: bucket.bestPage.pageId,
        pageSlug: bucket.bestPage.pageSlug,
        pageTitle: bucket.bestPage.pageTitle,
        isOrphan: !hasDedicatedPage,
        hasDedicatedPage,
      });
    }

    return result;
  }

  isEligibleCandidate(
    candidate: GscStrategistQueryCandidate,
    opts: {
      minImpressions: number;
      minPosition: number;
      maxPosition: number;
      brandTerms: string[];
    },
  ): boolean {
    if (candidate.impressions < opts.minImpressions) return false;
    if (candidate.avgPosition < opts.minPosition || candidate.avgPosition > opts.maxPosition) {
      return false;
    }
    if (this.isBrandedQuery(candidate.query, opts.brandTerms)) return false;
    const lowCtr = candidate.ctrGap <= -0.005;
    const highImpressions = candidate.impressions >= opts.minImpressions * 3;
    return lowCtr || highImpressions || candidate.isOrphan;
  }

  scoreCandidate(candidate: GscStrategistQueryCandidate): number {
    const positionBonus = Math.max(0, 31 - candidate.avgPosition);
    const orphanBonus = candidate.isOrphan ? 15 : 0;
    const ctrPenalty = Math.max(0, -candidate.ctrGap * 100);
    return candidate.impressions * 0.05 + positionBonus + orphanBonus + ctrPenalty;
  }

  isBrandedQuery(query: string, brandTerms: string[]): boolean {
    const normalized = query.toLowerCase();
    return brandTerms.some((term) => term && normalized.includes(term.toLowerCase()));
  }

  loadBrandTerms(): string[] {
    const fromEnv = process.env.GSC_STRATEGIST_BRAND_TERMS?.trim();
    if (fromEnv) {
      return fromEnv.split(',').map((term) => term.trim()).filter(Boolean);
    }
    return ['medcover', 'nestino', 'villa silyan', 'sindibed'];
  }

  expectedCtr(avgPosition: number): number {
    if (avgPosition <= 1) return 0.27;
    if (avgPosition <= 2) return 0.15;
    if (avgPosition <= 3) return 0.11;
    if (avgPosition <= 4) return 0.08;
    if (avgPosition <= 5) return 0.06;
    if (avgPosition <= 10) return 0.03;
    return 0.01;
  }
}
