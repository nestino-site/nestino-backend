import { Injectable } from '@nestjs/common';
import { ContentLanguage, PageStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface HreflangAlternate {
  hreflang: string;
  href: string;
}

export interface HreflangPageInput {
  id: number;
  siteId: number;
  slug: string;
  language: ContentLanguage | string;
}

export interface HreflangSiteInput {
  domain: string;
}

@Injectable()
export class HreflangService {
  constructor(private readonly prisma: PrismaService) {}

  async getAlternatesForPage(pageId: number): Promise<HreflangAlternate[]> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });
    if (!page) {
      return [];
    }
    return this.getAlternatesForPageData(page, page.site);
  }

  async getAlternatesForPageData(
    page: HreflangPageInput,
    site: HreflangSiteInput,
  ): Promise<HreflangAlternate[]> {
    const siblings = await this.prisma.page.findMany({
      where: {
        siteId: page.siteId,
        slug: page.slug,
        status: PageStatus.PUBLISHED,
        id: { not: page.id },
      },
      select: { id: true, language: true, slug: true },
    });

    const base = this.normalizeDomain(site.domain);
    const alternates: HreflangAlternate[] = [
      {
        hreflang: this.languageToHreflang(page.language),
        href: this.buildUrl(base, page.slug),
      },
    ];

    for (const s of siblings) {
      alternates.push({
        hreflang: this.languageToHreflang(s.language),
        href: this.buildUrl(base, s.slug),
      });
    }

    alternates.push({
      hreflang: 'x-default',
      href: this.buildUrl(base, page.slug),
    });

    return alternates;
  }

  private languageToHreflang(lang: string): string {
    return lang.toLowerCase().replace('_', '-');
  }

  private normalizeDomain(domain: string): string {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      return domain.endsWith('/') ? domain.slice(0, -1) : domain;
    }
    return `https://${domain.replace(/\/$/, '')}`;
  }

  private buildUrl(base: string, slug: string): string {
    const path = slug.startsWith('/') ? slug : `/${slug}`;
    return `${base}${path}`;
  }
}
