import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface MaturityThresholds {
  minAgeDays: number;
  minImpressions: number;
  minQueryRows: number;
  minIndexedPages: number;
}

export interface MaturityProgress {
  siteAgeDays: number;
  totalImpressions: number;
  queryRowCount: number;
  indexedPageCount: number;
}

export interface MaturityStatus {
  siteId: number;
  locked: boolean;
  unlockedAt: Date | null;
  thresholds: MaturityThresholds;
  progress: MaturityProgress;
  meetsAllThresholds: boolean;
}

@Injectable()
export class MaturityGateService {
  private readonly logger = new Logger(MaturityGateService.name);

  constructor(private readonly prisma: PrismaService) {}

  getThresholds(): MaturityThresholds {
    return {
      minAgeDays: Number(process.env.MATURITY_MIN_AGE_DAYS ?? 60),
      minImpressions: Number(process.env.MATURITY_MIN_IMPRESSIONS ?? 5000),
      minQueryRows: Number(process.env.MATURITY_MIN_QUERY_ROWS ?? 50),
      minIndexedPages: Number(process.env.MATURITY_MIN_INDEXED_PAGES ?? 10),
    };
  }

  async isUnlocked(siteId: number): Promise<boolean> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { automationUnlockedAt: true },
    });
    return site?.automationUnlockedAt != null;
  }

  async getStatus(siteId: number): Promise<MaturityStatus> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, createdAt: true, automationUnlockedAt: true },
    });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }

    const thresholds = this.getThresholds();
    const progress = await this.computeProgress(siteId, site.createdAt);
    const meetsAllThresholds =
      progress.siteAgeDays >= thresholds.minAgeDays &&
      progress.totalImpressions >= thresholds.minImpressions &&
      progress.queryRowCount >= thresholds.minQueryRows &&
      progress.indexedPageCount >= thresholds.minIndexedPages;

    return {
      siteId,
      locked: site.automationUnlockedAt == null,
      unlockedAt: site.automationUnlockedAt,
      thresholds,
      progress,
      meetsAllThresholds,
    };
  }

  async evaluateMaturity(siteId: number): Promise<{ unlocked: boolean; unlockedAt: Date | null }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { automationUnlockedAt: true, createdAt: true },
    });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }

    if (site.automationUnlockedAt) {
      return { unlocked: true, unlockedAt: site.automationUnlockedAt };
    }

    const status = await this.getStatus(siteId);
    if (!status.meetsAllThresholds) {
      return { unlocked: false, unlockedAt: null };
    }

    const updated = await this.prisma.site.update({
      where: { id: siteId },
      data: { automationUnlockedAt: new Date() },
      select: { automationUnlockedAt: true },
    });

    this.logger.log({
      msg: 'maturity_unlocked',
      siteId,
      progress: status.progress,
      thresholds: status.thresholds,
    });

    return { unlocked: true, unlockedAt: updated.automationUnlockedAt };
  }

  async unlock(siteId: number): Promise<MaturityStatus> {
    await this.prisma.site.update({
      where: { id: siteId },
      data: { automationUnlockedAt: new Date() },
    });
    this.logger.log({ msg: 'maturity_manual_unlock', siteId });
    return this.getStatus(siteId);
  }

  async lock(siteId: number): Promise<MaturityStatus> {
    await this.prisma.site.update({
      where: { id: siteId },
      data: { automationUnlockedAt: null },
    });
    this.logger.log({ msg: 'maturity_manual_lock', siteId });
    return this.getStatus(siteId);
  }

  private async computeProgress(siteId: number, siteCreatedAt: Date): Promise<MaturityProgress> {
    const lookbackDays = Number(process.env.GSC_LOOKBACK_DAYS ?? 28);
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const siteAgeDays = Math.floor(
      (Date.now() - siteCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    const [impressionAgg, queryRowCount, indexedPageCount] = await Promise.all([
      this.prisma.seoMetric.aggregate({
        where: {
          siteId,
          query: { not: null },
          date: { gte: since },
        },
        _sum: { impressions: true },
      }),
      this.prisma.seoMetric.count({
        where: {
          siteId,
          query: { not: null },
          date: { gte: since },
        },
      }),
      this.prisma.page.count({
        where: { siteId, publishedAt: { not: null } },
      }),
    ]);

    return {
      siteAgeDays,
      totalImpressions: impressionAgg._sum.impressions ?? 0,
      queryRowCount,
      indexedPageCount,
    };
  }
}
