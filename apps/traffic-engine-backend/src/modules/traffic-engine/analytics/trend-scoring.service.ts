import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface TrendWinner {
  query: string;
  pageId: number | null;
  pageSlug: string | null;
  recentImpressions: number;
  recentClicks: number;
  recentAvgPosition: number;
  impressionsDelta: number;
  clicksDelta: number;
  positionDelta: number;
  trendScore: number;
  source: 'rising' | 'momentum';
}

@Injectable()
export class TrendScoringService {
  constructor(private readonly prisma: PrismaService) {}

  async findWinners(siteId: number, limit = 50): Promise<TrendWinner[]> {
    const lookbackDays = Number(process.env.GSC_TREND_LOOKBACK_DAYS ?? 28);
    const midpointDays = Math.floor(lookbackDays / 2);
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - lookbackDays);
    const midpoint = new Date(now);
    midpoint.setDate(now.getDate() - midpointDays);

    const metrics = await this.prisma.seoMetric.findMany({
      where: {
        siteId,
        query: { not: null },
        date: { gte: windowStart },
      },
      include: { page: { select: { slug: true } } },
      orderBy: { date: 'desc' },
    });

    type QueryBucket = {
      query: string;
      pageId: number | null;
      pageSlug: string | null;
      recent: { impressions: number; clicks: number; positions: number[] };
      prior: { impressions: number; clicks: number; positions: number[] };
    };

    const buckets = new Map<string, QueryBucket>();

    for (const row of metrics) {
      if (!row.query) continue;
      const key = `${row.query}::${row.pageId ?? 'null'}`;
      const bucket =
        buckets.get(key) ??
        ({
          query: row.query,
          pageId: row.pageId,
          pageSlug: row.page?.slug ?? null,
          recent: { impressions: 0, clicks: 0, positions: [] },
          prior: { impressions: 0, clicks: 0, positions: [] },
        } satisfies QueryBucket);

      const target = row.date >= midpoint ? bucket.recent : bucket.prior;
      target.impressions += row.impressions;
      target.clicks += row.clicks;
      if (row.avgPosition != null) {
        target.positions.push(row.avgPosition);
      }
      buckets.set(key, bucket);
    }

    const minImpressions = Number(process.env.GSC_FEEDBACK_MIN_IMPRESSIONS ?? 100);
    const minClicks = Number(process.env.GSC_FEEDBACK_MIN_CLICKS ?? 3);
    const winners: TrendWinner[] = [];

    for (const bucket of buckets.values()) {
      const recentAvgPosition = this.avg(bucket.recent.positions);
      const priorAvgPosition = this.avg(bucket.prior.positions);
      const impressionsDelta = bucket.recent.impressions - bucket.prior.impressions;
      const clicksDelta = bucket.recent.clicks - bucket.prior.clicks;
      const positionDelta =
        priorAvgPosition != null && recentAvgPosition != null
          ? priorAvgPosition - recentAvgPosition
          : 0;

      const totalImpressions = bucket.recent.impressions + bucket.prior.impressions;
      const totalClicks = bucket.recent.clicks + bucket.prior.clicks;

      if (totalImpressions < minImpressions || totalClicks < minClicks) {
        continue;
      }

      const rising =
        impressionsDelta > 0 && (clicksDelta > 0 || positionDelta > 0.5);
      const momentum =
        recentAvgPosition != null &&
        recentAvgPosition >= 4 &&
        recentAvgPosition <= 15 &&
        bucket.recent.impressions >= minImpressions;

      if (!rising && !momentum) {
        continue;
      }

      const trendScore =
        clicksDelta * 10 +
        impressionsDelta * 0.05 +
        positionDelta * 5 +
        (momentum ? bucket.recent.impressions * 0.01 : 0);

      winners.push({
        query: bucket.query,
        pageId: bucket.pageId,
        pageSlug: bucket.pageSlug,
        recentImpressions: bucket.recent.impressions,
        recentClicks: bucket.recent.clicks,
        recentAvgPosition: recentAvgPosition ?? 100,
        impressionsDelta,
        clicksDelta,
        positionDelta,
        trendScore,
        source: rising ? 'rising' : 'momentum',
      });
    }

    return winners.sort((a, b) => b.trendScore - a.trendScore).slice(0, limit);
  }

  private avg(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}
