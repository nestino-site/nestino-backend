import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface Ga4SyncResult {
  synced: boolean;
  rows: number;
  reason?: string;
}

/**
 * GA4 Data API ingestion stub. Returns no-op until GA4_PROPERTY_ID and service account
 * credentials are configured and the real Data API client is implemented.
 */
@Injectable()
export class Ga4IngestionService {
  private readonly logger = new Logger(Ga4IngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncSiteIfConfigured(siteId: number): Promise<Ga4SyncResult> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { ga4PropertyId: true },
    });

    if (!site?.ga4PropertyId) {
      return { synced: false, rows: 0, reason: 'no_ga4_property' };
    }

    const propertyId = process.env.GA4_PROPERTY_ID?.trim();
    const clientEmail = process.env.GA4_CLIENT_EMAIL?.trim();
    const privateKey = process.env.GA4_PRIVATE_KEY?.trim();

    if (!propertyId || !clientEmail || !privateKey) {
      this.logger.debug({ msg: 'ga4_skip_no_credentials', siteId });
      return { synced: false, rows: 0, reason: 'no_credentials' };
    }

    this.logger.debug({
      msg: 'ga4_stub_not_implemented',
      siteId,
      ga4PropertyId: site.ga4PropertyId,
    });
    return { synced: false, rows: 0, reason: 'stub_not_implemented' };
  }

  async syncAllSites(): Promise<void> {
    const sites = await this.prisma.site.findMany({
      where: { ga4PropertyId: { not: null } },
      select: { id: true },
    });
    for (const site of sites) {
      await this.syncSiteIfConfigured(site.id);
    }
  }
}
