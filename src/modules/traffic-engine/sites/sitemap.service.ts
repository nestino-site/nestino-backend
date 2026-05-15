import { Injectable, NotFoundException } from '@nestjs/common';
import { PageStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class SitemapService {
  constructor(private readonly prisma: PrismaService) {}

  async buildXmlForSite(siteId: number): Promise<string> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }

    const pages = await this.prisma.page.findMany({
      where: { siteId, status: PageStatus.PUBLISHED },
      orderBy: { updatedAt: 'desc' },
      select: { slug: true, updatedAt: true, publishedAt: true },
    });

    const base = this.normalizeDomain(site.domain);
    const urls = pages
      .map((p) => {
        const loc = this.buildLoc(base, p.slug);
        const lastmod = (p.publishedAt ?? p.updatedAt).toISOString().slice(0, 10);
        return `  <url>
    <loc>${this.escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  }

  async buildXmlForDomain(domain: string): Promise<string> {
    const normalized = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const site = await this.prisma.site.findFirst({
      where: {
        OR: [{ domain: normalized }, { domain: `https://${normalized}` }, { domain: `http://${normalized}` }],
      },
    });
    if (!site) {
      throw new NotFoundException(`No site found for domain ${domain}`);
    }
    return this.buildXmlForSite(site.id);
  }

  private normalizeDomain(domain: string): string {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      return domain.endsWith('/') ? domain.slice(0, -1) : domain;
    }
    return `https://${domain.replace(/\/$/, '')}`;
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
