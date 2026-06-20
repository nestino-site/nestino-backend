import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SeoStrategyService } from '../seo-strategy/seo-strategy.service';
import { Ga4IngestionService } from './ga4-ingestion.service';
import { GscFeedbackLoopService } from './gsc-feedback-loop.service';
import { GscIngestionService } from './gsc-ingestion.service';
import { MaturityGateService } from './maturity-gate.service';

@Injectable()
export class AnalyticsIngestionService {
  private readonly logger = new Logger(AnalyticsIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gscIngestion: GscIngestionService,
    private readonly ga4Ingestion: Ga4IngestionService,
    private readonly maturityGate: MaturityGateService,
    private readonly gscFeedbackLoop: GscFeedbackLoopService,
    @Optional() private readonly seoStrategy?: SeoStrategyService,
  ) {}

  async syncSiteMetrics(siteId: number): Promise<{ gsc: { synced: boolean; rows: number } }> {
    const gscResult = await this.gscIngestion.syncSiteIfConfigured(siteId);
    if (gscResult.synced) {
      this.logger.log({ msg: 'gsc_sync_complete', siteId, rows: gscResult.rows });
    } else {
      await this.createPlaceholderMetricIfNeeded(siteId);
    }

    await this.ga4Ingestion.syncSiteIfConfigured(siteId).catch(() => null);
    await this.maturityGate.evaluateMaturity(siteId);
    await this.runAutomationIfUnlocked(siteId);
    return { gsc: gscResult };
  }

  async syncAllSites(): Promise<void> {
    const sites = await this.prisma.site.findMany({ select: { id: true } });
    for (const site of sites) {
      await this.syncSiteMetrics(site.id);
    }
  }

  private async createPlaceholderMetricIfNeeded(siteId: number): Promise<void> {
    const hasGscJson = Boolean(process.env.GSC_SERVICE_ACCOUNT_JSON?.trim());
    const hasLegacyGsc = Boolean(process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY);
    const hasGa4 = Boolean(process.env.GA4_PROPERTY_ID && process.env.GA4_CLIENT_EMAIL);
    if (!hasGscJson && !hasLegacyGsc && !hasGa4) {
      this.logger.warn({ msg: 'analytics_skipped_no_credentials', siteId });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const existing = await this.prisma.seoMetric.findFirst({
      where: { siteId, pageId: null, query: null, date: today },
    });
    if (existing) {
      return;
    }

    await this.prisma.seoMetric.create({
      data: {
        siteId,
        pageId: null,
        query: null,
        date: today,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        organicSessions: 0,
      },
    });
  }

  private async runAutomationIfUnlocked(siteId: number): Promise<void> {
    const unlocked = await this.maturityGate.isUnlocked(siteId);
    if (!unlocked) {
      this.logger.debug({ msg: 'automation_locked', siteId });
      return;
    }

    if (this.seoStrategy) {
      await this.seoStrategy.autoEnqueueQuickWins(siteId).catch(() => null);
      await this.seoStrategy.autoEnqueueCannibalizationTasks(siteId).catch(() => null);
    }

    await this.gscFeedbackLoop.processSite(siteId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'gsc_feedback_loop_failed', siteId, error: message });
    });
  }
}
