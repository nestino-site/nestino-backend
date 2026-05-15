import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsIngestionService {
  private readonly logger = new Logger(AnalyticsIngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Placeholder sync: creates/updates a daily aggregate row when GSC/GA4 credentials are absent. */
  async syncSiteMetrics(siteId: number): Promise<void> {
    const hasGsc = Boolean(process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY);
    const hasGa4 = Boolean(process.env.GA4_PROPERTY_ID && process.env.GA4_CLIENT_EMAIL);
    if (!hasGsc && !hasGa4) {
      this.logger.warn({ msg: 'analytics_skipped_no_credentials', siteId });
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const existing = await this.prisma.seoMetric.findFirst({
      where: { siteId, pageId: null, date: today },
    });
    if (existing) {
      await this.prisma.seoMetric.update({
        where: { id: existing.id },
        data: {},
      });
      return;
    }
    await this.prisma.seoMetric.create({
      data: {
        siteId,
        pageId: null,
        date: today,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        organicSessions: 0,
      },
    });
  }

  async syncAllSites(): Promise<void> {
    const sites = await this.prisma.site.findMany({ select: { id: true } });
    for (const s of sites) {
      await this.syncSiteMetrics(s.id);
    }
  }
}
