import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Pulls Search Console metrics when GSC_SERVICE_ACCOUNT_JSON and site.gscProperty are configured.
 * Falls back to no-op when credentials are missing (metrics can still be pushed via API).
 */
@Injectable()
export class GscIngestionService {
  private readonly logger = new Logger(GscIngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncSiteIfConfigured(siteId: number): Promise<{ synced: boolean; rows: number }> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site?.gscProperty) {
      return { synced: false, rows: 0 };
    }

    const saJson = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
    if (!saJson) {
      this.logger.debug({ msg: 'gsc_skip_no_credentials', siteId });
      return { synced: false, rows: 0 };
    }

    try {
      // Placeholder for Google Search Console API client wiring.
      // Production: use googleapis searchconsole.searchanalytics.query with service account.
      this.logger.log({
        msg: 'gsc_sync_placeholder',
        siteId,
        property: site.gscProperty,
        hint: 'Set up googleapis client to populate seo_metrics from GSC',
      });
      return { synced: false, rows: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'gsc_sync_failed', siteId, error: message });
      return { synced: false, rows: 0 };
    }
  }

  async syncAllSites(): Promise<void> {
    const sites = await this.prisma.site.findMany({
      where: { gscProperty: { not: null } },
      select: { id: true },
    });
    for (const site of sites) {
      await this.syncSiteIfConfigured(site.id);
    }
  }
}
