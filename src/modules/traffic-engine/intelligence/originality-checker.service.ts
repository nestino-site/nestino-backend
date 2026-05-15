import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/** Max fraction of 5-gram shingles allowed to overlap with existing site pages before rejection. */
const MAX_OVERLAP_RATIO = Number(process.env.ORIGINALITY_MAX_OVERLAP ?? 0.25);
const NGRAM_SIZE = 5;
const MAX_PAGES_TO_COMPARE = Number(process.env.ORIGINALITY_COMPARE_LIMIT ?? 20);

@Injectable()
export class OriginalityCheckerService {
  private readonly logger = new Logger(OriginalityCheckerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute n-gram overlap of `draft` against recent published pages on the same site.
   * Returns the max overlap ratio found and the page slug that triggered it.
   */
  async check(
    siteId: number,
    draft: string,
    excludePageId?: number,
  ): Promise<{ overlapRatio: number; matchedSlug: string | null; passed: boolean }> {
    if (!draft.trim()) {
      return { overlapRatio: 0, matchedSlug: null, passed: true };
    }

    const pages = await this.prisma.page.findMany({
      where: {
        siteId,
        ...(excludePageId ? { id: { not: excludePageId } } : {}),
        finalContent: { not: null },
      },
      select: { id: true, slug: true, finalContent: true },
      orderBy: { publishedAt: 'desc' },
      take: MAX_PAGES_TO_COMPARE,
    });

    if (pages.length === 0) {
      return { overlapRatio: 0, matchedSlug: null, passed: true };
    }

    const draftShingles = this.shingle(draft, NGRAM_SIZE);
    let maxOverlap = 0;
    let matchedSlug: string | null = null;

    for (const page of pages) {
      if (!page.finalContent) continue;
      const pageShingles = this.shingle(page.finalContent, NGRAM_SIZE);
      const overlap = this.jaccardIntersectionRatio(draftShingles, pageShingles);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        matchedSlug = page.slug;
      }
    }

    const passed = maxOverlap <= MAX_OVERLAP_RATIO;
    if (!passed) {
      this.logger.warn({
        msg: 'originality_check_failed',
        siteId,
        overlapRatio: maxOverlap.toFixed(3),
        matchedSlug,
      });
    }

    return { overlapRatio: maxOverlap, matchedSlug, passed };
  }

  private shingle(text: string, n: number): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const shingles = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      shingles.add(words.slice(i, i + n).join(' '));
    }
    return shingles;
  }

  private jaccardIntersectionRatio(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersectionCount = 0;
    for (const s of a) {
      if (b.has(s)) intersectionCount++;
    }
    return intersectionCount / Math.min(a.size, b.size);
  }
}
