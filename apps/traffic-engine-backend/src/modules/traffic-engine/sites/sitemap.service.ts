import { Injectable, NotFoundException } from '@nestjs/common';
import { PageStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  siteDomainLookupVariants,
  toPublicSiteBaseUrl,
} from '../../../common/utils/site-domain.util';

const SITEMAP_PAGE_SIZE = 1000;

interface SitemapPageRow {
  id: number;
  slug: string;
  language: string;
  title: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
  generatedImageCdnUrl: string | null;
}

@Injectable()
export class SitemapService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns sitemap XML (index for sites with >1000 pages; single for smaller sites). */
  async buildXmlForSite(siteId: number, page = 0): Promise<string> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }

    const base = this.normalizeDomain(site.domain);
    const totalCount = await this.prisma.page.count({ where: { siteId, status: PageStatus.PUBLISHED } });

    // If paged request or single-page count, return a regular sitemap
    if (page > 0 || totalCount <= SITEMAP_PAGE_SIZE) {
      const pages = await this.prisma.page.findMany({
        where: { siteId, status: PageStatus.PUBLISHED },
        orderBy: { updatedAt: 'desc' },
        take: SITEMAP_PAGE_SIZE,
        skip: page * SITEMAP_PAGE_SIZE,
        select: {
          id: true,
          slug: true,
          language: true,
          title: true,
          updatedAt: true,
          publishedAt: true,
          generatedImageCdnUrl: true,
        },
      });

      // Load all published pages (same slug, all locales) for hreflang
      const slugs = [...new Set(pages.map((p) => p.slug))];
      const allLocalePages = await this.prisma.page.findMany({
        where: { siteId, slug: { in: slugs }, status: PageStatus.PUBLISHED },
        select: { id: true, slug: true, language: true },
      });

      const slugToAlternates = new Map<string, Array<{ language: string; slug: string }>>();
      for (const p of allLocalePages) {
        const list = slugToAlternates.get(p.slug) ?? [];
        list.push({ language: p.language, slug: p.slug });
        slugToAlternates.set(p.slug, list);
      }

      return this.buildUrlSetXml(base, pages, slugToAlternates);
    }

    // For large sites: return sitemap index
    const pageCount = Math.ceil(totalCount / SITEMAP_PAGE_SIZE);
    return this.buildSitemapIndexXml(base, siteId, pageCount);
  }

  async buildXmlForDomain(domain: string, page = 0): Promise<string> {
    const siteId = await this.getSiteIdByDomain(domain);
    return this.buildXmlForSite(siteId, page);
  }

  async getSiteIdByDomain(domain: string): Promise<number> {
    const variants = siteDomainLookupVariants(domain);
    const site = await this.prisma.site.findFirst({
      where: { OR: variants.map((value) => ({ domain: value })) },
      select: { id: true },
    });
    if (!site) throw new NotFoundException(`No site found for domain ${domain}`);
    return site.id;
  }

  /** robots.txt content for a site. */
  async buildRobotsTxt(siteId: number): Promise<string> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
    const base = this.normalizeDomain(site.domain);
    const config = (site.config ?? {}) as Record<string, unknown>;
    const robotsRules = Array.isArray(config.robotsRules) ? (config.robotsRules as string[]) : [];
    const disallowLines = robotsRules.map((r) => `Disallow: ${r}`).join('\n');

    return `User-agent: *\nAllow: /\n${disallowLines ? `${disallowLines}\n` : ''}
Sitemap: ${base}/sitemap.xml
`;
  }

  private buildUrlSetXml(
    base: string,
    pages: SitemapPageRow[],
    slugToAlternates: Map<string, Array<{ language: string; slug: string }>>,
  ): string {
    const urls = pages
      .map((p) => {
        const loc = this.buildLoc(base, p.slug);
        const lastmod = (p.publishedAt ?? p.updatedAt).toISOString();
        const priority = 0.8;
        const changefreq = 'weekly';

        // hreflang alternates for this slug
        const alternates = slugToAlternates.get(p.slug) ?? [];
        const hreflangLines = alternates.length > 1
          ? alternates
              .map(
                (a) =>
                  `    <xhtml:link rel="alternate" hreflang="${a.language.toLowerCase()}" href="${this.escapeXml(this.buildLoc(base, a.slug))}"/>`,
              )
              .join('\n') +
            `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${this.escapeXml(loc)}"/>`
          : '';

        // Image entry — use the CDN URL stored on the page after upload
        let imageBlock = '';
        if (p.generatedImageCdnUrl) {
          const imgTitle = p.title ?? p.slug;
          imageBlock = `\n    <image:image>\n      <image:loc>${this.escapeXml(p.generatedImageCdnUrl)}</image:loc>\n      <image:title>${this.escapeXml(imgTitle)}</image:title>\n    </image:image>`;
        }

        return `  <url>
    <loc>${this.escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${hreflangLines ? `\n${hreflangLines}` : ''}${imageBlock}
  </url>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
  }

  private buildSitemapIndexXml(base: string, siteId: number, pageCount: number): string {
    const sitemaps = Array.from({ length: pageCount }, (_, i) =>
      `  <sitemap>\n    <loc>${this.escapeXml(`${base}/sitemap.xml?siteId=${siteId}&page=${i + 1}`)}</loc>\n  </sitemap>`,
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>`;
  }

  private normalizeDomain(domain: string): string {
    return toPublicSiteBaseUrl(domain);
  }

  private buildLoc(base: string, slug: string): string {
    const path = slug.startsWith('/') ? slug : `/${slug}`;
    return `${base}${path}`;
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
