import { Injectable, Logger } from '@nestjs/common';
import { PageStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface InternalLinkTarget {
  pageId: number;
  slug: string;
  title: string | null;
  keyword: string;
  score: number;
}

export interface InternalLinkingResult {
  content: string;
  linksAdded: number;
  targets: InternalLinkTarget[];
}

@Injectable()
export class InternalLinkingService {
  private readonly logger = new Logger(InternalLinkingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Injects up to `maxLinks` contextual internal links into markdown content.
   */
  async enrichContent(
    siteId: number,
    currentPageId: number,
    content: string,
    primaryKeyword: string,
    secondaryKeywords: string[],
    options?: { maxLinks?: number; pillarPageId?: number | null },
  ): Promise<InternalLinkingResult> {
    const maxLinks = options?.maxLinks ?? 5;
    const targets = await this.findLinkTargets(
      siteId,
      currentPageId,
      primaryKeyword,
      secondaryKeywords,
      maxLinks,
      options?.pillarPageId,
    );

    if (targets.length === 0) {
      return { content, linksAdded: 0, targets: [] };
    }

    let enriched = content;
    let linksAdded = 0;
    const linkedSlugs = new Set<string>();

    for (const target of targets) {
      if (linksAdded >= maxLinks) {
        break;
      }
      const anchor = this.pickAnchor(target);
      const url = target.slug.startsWith('/') ? target.slug : `/${target.slug}`;
      if (enriched.includes(`](${url})`) || enriched.includes(`](${url}/`)) {
        continue;
      }
      const injected = this.injectLink(enriched, anchor, url, target.keyword);
      if (injected !== enriched) {
        enriched = injected;
        linksAdded += 1;
        linkedSlugs.add(url);
      }
    }

    this.logger.log({
      msg: 'internal_links_applied',
      pageId: currentPageId,
      linksAdded,
      targetCount: targets.length,
    });

    return { content: enriched, linksAdded, targets };
  }

  async findLinkTargets(
    siteId: number,
    excludePageId: number,
    primaryKeyword: string,
    secondaryKeywords: string[],
    limit: number,
    pillarPageId?: number | null,
  ): Promise<InternalLinkTarget[]> {
    const published = await this.prisma.page.findMany({
      where: {
        siteId,
        status: PageStatus.PUBLISHED,
        id: { not: excludePageId },
        finalContent: { not: null },
      },
      include: { keyword: true },
      take: 200,
      orderBy: { publishedAt: 'desc' },
    });

    const terms = [
      primaryKeyword.toLowerCase(),
      ...secondaryKeywords.map((k) => k.toLowerCase()),
    ].filter(Boolean);

    const scored: InternalLinkTarget[] = published.map((p) => {
      const kw = p.keyword.keyword.toLowerCase();
      let score = 0;
      if (terms.some((t) => kw.includes(t) || t.includes(kw))) {
        score += 3;
      }
      const title = (p.title ?? '').toLowerCase();
      if (terms.some((t) => title.includes(t))) {
        score += 2;
      }
      const slug = p.slug.toLowerCase();
      if (terms.some((t) => slug.includes(t.replace(/\s+/g, '-')))) {
        score += 1;
      }
      if (pillarPageId && p.id === pillarPageId) {
        score += 10;
      }
      return {
        pageId: p.id,
        slug: p.slug,
        title: p.title,
        keyword: p.keyword.keyword,
        score,
      };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private pickAnchor(target: InternalLinkTarget): string {
    const title = target.title?.trim();
    if (title && title.length <= 80) {
      return title;
    }
    return target.keyword;
  }

  /**
   * Inserts the first occurrence of anchor text (case-insensitive) outside existing links/headings.
   */
  private injectLink(content: string, anchor: string, url: string, fallbackKeyword: string): string {
    const needles = [anchor, fallbackKeyword].filter((n) => n.length >= 4);
    for (const needle of needles) {
      const re = new RegExp(`(?<![\\[#])\\b(${this.escapeRegex(needle)})\\b`, 'i');
      const match = content.match(re);
      if (!match || match.index == null) {
        continue;
      }
      const idx = match.index;
      const before = content.slice(0, idx);
      if (this.isInsideLinkOrHeading(before)) {
        continue;
      }
      const matched = match[1];
      return (
        content.slice(0, idx) +
        `[${matched}](${url})` +
        content.slice(idx + matched.length)
      );
    }
    return content;
  }

  private isInsideLinkOrHeading(before: string): boolean {
    const openBracket = (before.match(/\[/g) ?? []).length;
    const closeBracket = (before.match(/\]/g) ?? []).length;
    if (openBracket > closeBracket) {
      return true;
    }
    const lines = before.split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    return /^#{1,6}\s/.test(lastLine.trimStart());
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
