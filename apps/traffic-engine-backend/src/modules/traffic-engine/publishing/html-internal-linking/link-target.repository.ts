/**
 * Queries published Pages and scores them as internal link candidates using
 * the extracted keyword phrases.
 *
 * Scoring strategy (phrase + token):
 *   Phrase-level (whole extracted phrase vs page data):
 *     +3  extracted phrase matches (or is contained by) the page's primary keyword.keyword
 *     +2  extracted phrase appears in the page title
 *     +1  extracted phrase appears in the slug (dash-normalised)
 *
 *   Token-level (individual significant words from the phrase vs slug/title):
 *     +0.5  a significant token (≥5 chars, non-stopword) appears in the slug or title
 *           This lets "dental clinic in Alicante" match slugs that contain "alicante"
 *           or "dental" even when the full phrase doesn't appear verbatim.
 *
 *   All per-phrase scores are multiplied by the phrase weight (1–5).
 *   De-duplication: one result per slug.
 */
import { Injectable } from '@nestjs/common';
import { PageStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import type { ExtractedKeyword, InternalLinkTarget } from './html-internal-linking.types';

const CANDIDATE_POOL_SIZE = 200;
const MIN_SCORE = 1;

/** Tokens shorter than this are skipped in token-level scoring (avoids "in", "of" noise) */
const MIN_TOKEN_CHARS = 5;

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'always', 'among', 'being', 'between',
  'could', 'every', 'front', 'given', 'having', 'their', 'there', 'these',
  'those', 'through', 'under', 'using', 'where', 'which', 'while', 'would',
  'other', 'often', 'since', 'still', 'three', 'today', 'until',
]);

/**
 * Extracts individual significant tokens from a multi-word phrase.
 * Used for token-level scoring in the slug/title match.
 */
function significantTokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= MIN_TOKEN_CHARS && !STOP_WORDS.has(t));
}

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
      phrase: k.phrase,
      normalized: k.phrase.toLowerCase(),
      dashed: k.phrase.toLowerCase().replace(/\s+/g, '-'),
      tokens: significantTokens(k.phrase),
      weight: k.weight,
    }));

    const seen = new Set<string>();
    const scored: InternalLinkTarget[] = [];

    for (const page of published) {
      if (seen.has(page.slug)) continue;

      // Guard: keyword relation may be null when keywordId is orphaned or not set
      const kw = (page.keyword?.keyword ?? '').toLowerCase();
      const title = (page.title ?? '').toLowerCase();
      const slug = page.slug.toLowerCase();

      let score = 0;
      let bestMatchedKeyword = '';
      let bestHit = 0;

      for (const { phrase, normalized, dashed, tokens, weight } of phrases) {
        let hit = 0;

        // Phrase-level scoring
        if (kw && (kw.includes(normalized) || normalized.includes(kw))) hit += 3;
        if (title.includes(normalized)) hit += 2;
        if (slug.includes(dashed) || slug.includes(normalized)) hit += 1;

        // Token-level scoring: each significant token that appears in slug or title
        // adds 0.5. This allows "dental clinic in Alicante" → token "alicante"
        // to match pages whose slug contains "/alicante/".
        for (const token of tokens) {
          if (slug.includes(token) || title.includes(token)) {
            hit += 0.5;
          }
        }

        const weighted = hit * weight;
        score += weighted;
        // Track the highest-scoring extracted phrase so the injector can find it in article text
        if (weighted > bestHit) {
          bestHit = weighted;
          // Prefer the shortest matching token if phrase-level had no slug/title hit —
          // this increases the chance the injector finds it verbatim in the article.
          const phraseHit = hit - tokens.filter((t) => slug.includes(t) || title.includes(t)).length * 0.5;
          bestMatchedKeyword = phraseHit > 0 ? phrase : (tokens.find((t) => slug.includes(t) || title.includes(t)) ?? phrase);
        }
      }

      if (score < MIN_SCORE) continue;

      seen.add(page.slug);
      const normalizedSlug = page.slug.startsWith('/') ? page.slug : `/${page.slug}`;
      const base = normalizeDomain(domain);
      const primaryKeyword = page.keyword?.keyword ?? page.title ?? '';

      scored.push({
        pageId: page.id,
        slug: page.slug,
        title: page.title,
        primaryKeyword,
        matchedKeyword: bestMatchedKeyword || primaryKeyword,
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
