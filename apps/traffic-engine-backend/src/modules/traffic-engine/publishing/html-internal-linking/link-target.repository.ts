/**
 * Queries published Pages and scores them as internal link candidates using
 * the extracted keyword phrases.
 *
 * Scoring strategy (keyword_title):
 *   +3  extracted phrase matches (or is contained by) the page's primary keyword.keyword
 *   +2  extracted phrase appears in the page title
 *   +1  extracted phrase appears in the slug (dash-normalized)
 *   Weight of the extracted keyword multiplied into the score
 *
 * De-duplication: one result per slug.
 */
import { Injectable } from '@nestjs/common';
import { PageStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import type { ExtractedKeyword, InternalLinkTarget } from './html-internal-linking.types';

const CANDIDATE_POOL_SIZE = 200;
const MIN_SCORE = 1;

@Injectable()
export class LinkTargetRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns up to `limit` scored link targets for the given site, excluding
   * the current page being published.
   */
  async findPublishedTargets(
    siteId: number,
    excludePageId: number,
    keywords: ExtractedKeyword[],
    domain: string,
    limit: number,
  ): Promise<InternalLinkTarget[]> {
    if (keywords.length === 0) return [];

    const published = await this.prisma.page.findMany({
      where: {
        siteId,
        status: PageStatus.PUBLISHED,
        id: { not: excludePageId },
        htmlContent: { not: null },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        robotsMeta: true,
        keyword: { select: { keyword: true } },
      },
      take: CANDIDATE_POOL_SIZE,
      orderBy: { publishedAt: 'desc' },
    });

    const phrases = keywords.map((k) => ({
      normalized: k.phrase.toLowerCase(),
      dashed: k.phrase.toLowerCase().replace(/\s+/g, '-'),
      weight: k.weight,
    }));

    const seen = new Set<string>();
    const scored: InternalLinkTarget[] = [];

    for (const page of published) {
      if (seen.has(page.slug)) continue;

      const kw = page.keyword.keyword.toLowerCase();
      const title = (page.title ?? '').toLowerCase();
      const slug = page.slug.toLowerCase();

      let score = 0;
      for (const { normalized, dashed, weight } of phrases) {
        let hit = 0;
        if (kw.includes(normalized) || normalized.includes(kw)) hit += 3;
        if (title.includes(normalized)) hit += 2;
        if (slug.includes(dashed) || slug.includes(normalized)) hit += 1;
        score += hit * weight;
      }

      if (score < MIN_SCORE) continue;

      seen.add(page.slug);
      const normalizedSlug = page.slug.startsWith('/') ? page.slug : `/${page.slug}`;
      const base = normalizeDomain(domain);

      scored.push({
        pageId: page.id,
        slug: page.slug,
        title: page.title,
        primaryKeyword: page.keyword.keyword,
        relevanceScore: score,
        url: `${base}${normalizedSlug}`,
        robotsMeta: page.robotsMeta,
      });
    }

    return scored
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }
}

function normalizeDomain(domain: string): string {
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    return domain.replace(/\/$/, '');
  }
  return `https://${domain.replace(/\/$/, '')}`;
}
