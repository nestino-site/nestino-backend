import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../../../common/prisma/prisma.service';

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

const GSC_LOOKBACK_DAYS = Number(process.env.GSC_LOOKBACK_DAYS ?? 28);

/**
 * Pulls Search Console metrics when GSC_SERVICE_ACCOUNT_JSON and site.gscProperty are configured.
 * Upserts per-page, per-query rows into seo_metrics.
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
      const credentials = JSON.parse(saJson) as Record<string, unknown>;
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      });

      const searchconsole = google.searchconsole({ version: 'v1', auth });
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - GSC_LOOKBACK_DAYS);

      const isoEnd = endDate.toISOString().slice(0, 10);
      const isoStart = startDate.toISOString().slice(0, 10);

      // Fetch page+query dimension data
      const response = await searchconsole.searchanalytics.query({
        siteUrl: site.gscProperty,
        requestBody: {
          startDate: isoStart,
          endDate: isoEnd,
          dimensions: ['page', 'query'],
          rowLimit: 5000,
        },
      });

      const rows: GscRow[] = (response.data.rows ?? []) as GscRow[];
      let upsertCount = 0;

      // Build page slug → page id map for this site
      const pages = await this.prisma.page.findMany({
        where: { siteId },
        select: { id: true, slug: true },
      });
      const slugToId = new Map(pages.map((p) => [p.slug, p.id]));
      const normalizedBase = site.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

      const date = endDate;
      date.setUTCHours(0, 0, 0, 0);

      for (const row of rows) {
        if (!row.keys || row.keys.length < 2) continue;
        const pageUrl = row.keys[0];
        const query = row.keys[1];

        // Resolve page id from URL
        let pageId: number | null = null;
        const slugFromUrl = pageUrl
          .replace(/^https?:\/\//, '')
          .replace(normalizedBase, '')
          .replace(/^\//, '')
          .replace(/\/$/, '');
        pageId = slugToId.get(slugFromUrl) ?? slugToId.get(`/${slugFromUrl}`) ?? null;

        const ctr = row.ctr ?? 0;
        const avgPosition = row.position ?? null;
        const expectedCtr = avgPosition != null ? this.expectedCtr(avgPosition) : null;
        const ctrGap = expectedCtr != null ? ctr - expectedCtr : null;

        await this.prisma.seoMetric.upsert({
          where: { siteId_pageId_date: { siteId, pageId: pageId ?? null as unknown as number, date } },
          create: {
            siteId,
            pageId,
            query,
            date,
            impressions: row.impressions ?? 0,
            clicks: row.clicks ?? 0,
            ctr,
            avgPosition,
            ctrExpected: expectedCtr,
            ctrGap,
            organicSessions: 0,
          },
          update: {
            query,
            impressions: row.impressions ?? 0,
            clicks: row.clicks ?? 0,
            ctr,
            avgPosition,
            ctrExpected: expectedCtr,
            ctrGap,
          },
        });
        upsertCount++;
      }

      this.logger.log({ msg: 'gsc_sync_complete', siteId, rows: upsertCount, property: site.gscProperty });
      return { synced: true, rows: upsertCount };
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

  private expectedCtr(avgPosition: number): number {
    if (avgPosition <= 1) return 0.27;
    if (avgPosition <= 2) return 0.15;
    if (avgPosition <= 3) return 0.11;
    if (avgPosition <= 4) return 0.08;
    if (avgPosition <= 5) return 0.06;
    if (avgPosition <= 10) return 0.03;
    return 0.01;
  }
}
