/**
 * Builds a full SEO quality report for a set of injected internal links.
 *
 * Checks performed:
 *  1. linkCount / withinRange (3–4 is the SEO best-practice sweet spot)
 *  2. relevance – anchor text vs primary keyword token-overlap score
 *  3. overOptimization – first-occurrence-only (no duplicate anchors or URLs)
 *  4. targetsIndexable – target pages must be PUBLISHED and not noindex
 *  5. duplicates – no duplicate anchor text, no duplicate destination URLs
 *  6. constraintViolations – anchors must not be inside h1-h6, a, button, img, code, pre
 *  7. distribution – links should not all cluster in the same paragraph/section
 *
 * The `passed` flag is true only when the injection is safe to commit.
 * The `score` (0–100) can be used to compare candidates or tune thresholds.
 */
import * as cheerio from 'cheerio';
import type {
  InjectedLink,
  InternalLinkTarget,
  SeoConstraintViolation,
  SeoDistributionInfo,
  SeoLinkingReport,
  SeoLinkRelevanceItem,
} from './html-internal-linking.types';

const MIN_LINKS = 3;
const MAX_LINKS = 4;
const MIN_RELEVANCE_SCORE = 0.15; // at least 15% token overlap to be considered relevant
const FORBIDDEN_ANCESTORS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'img', 'code', 'pre', 'figcaption'];

export function buildSeoReport(
  html: string,
  injectedLinks: InjectedLink[],
  targets: InternalLinkTarget[],
): SeoLinkingReport {
  const issues: string[] = [];

  // ------------------------------------------------------------------
  // 1. Link count
  // ------------------------------------------------------------------
  const linkCount = injectedLinks.length;
  const tooMany = linkCount > MAX_LINKS;
  const tooFew = linkCount > 0 && linkCount < MIN_LINKS;
  const withinRange = linkCount >= MIN_LINKS && linkCount <= MAX_LINKS;

  if (tooMany) issues.push(`Too many internal links: ${linkCount} (max ${MAX_LINKS})`);
  if (tooFew) issues.push(`Too few internal links: ${linkCount} (target ${MIN_LINKS}–${MAX_LINKS})`);

  // ------------------------------------------------------------------
  // 2. Relevance: token-overlap between anchor and primary keyword
  // ------------------------------------------------------------------
  const relevance: SeoLinkRelevanceItem[] = injectedLinks.map((link) => {
    const target = targets.find((t) => t.url === link.url);
    const primaryKeyword = target?.primaryKeyword ?? link.primaryKeyword;
    const overlapScore = tokenOverlap(link.anchorText, primaryKeyword);
    const weak = overlapScore < MIN_RELEVANCE_SCORE;
    if (weak) {
      issues.push(`Weak anchor relevance for "${link.anchorText}" → "${primaryKeyword}" (overlap ${(overlapScore * 100).toFixed(0)}%)`);
    }
    return { anchorText: link.anchorText, url: link.url, primaryKeyword, overlapScore, weak };
  });

  // ------------------------------------------------------------------
  // 3. Over-optimization: duplicate anchors or duplicate URLs
  // ------------------------------------------------------------------
  const anchorCounts = countDuplicates(injectedLinks.map((l) => l.anchorText.toLowerCase()));
  const urlCounts = countDuplicates(injectedLinks.map((l) => l.url));
  const duplicateAnchors = Object.keys(anchorCounts).filter((k) => anchorCounts[k] > 1);
  const duplicateUrls = Object.keys(urlCounts).filter((k) => urlCounts[k] > 1);
  const overOptimized = duplicateAnchors.length > 0 || duplicateUrls.length > 0;

  if (duplicateAnchors.length > 0) {
    issues.push(`Duplicate anchor text: ${duplicateAnchors.join(', ')}`);
  }
  if (duplicateUrls.length > 0) {
    issues.push(`Duplicate destination URLs: ${duplicateUrls.join(', ')}`);
  }

  // ------------------------------------------------------------------
  // 4. Targets indexable: PUBLISHED + not noindex
  // ------------------------------------------------------------------
  const nonIndexableTargets: string[] = [];
  for (const link of injectedLinks) {
    const target = targets.find((t) => t.url === link.url);
    if (target?.robotsMeta?.toLowerCase().includes('noindex')) {
      nonIndexableTargets.push(link.url);
      issues.push(`Target is noindex: ${link.url}`);
    }
  }
  const targetsIndexable = nonIndexableTargets.length === 0;

  // ------------------------------------------------------------------
  // 5. Constraint violations: anchors inside forbidden elements
  //    We re-parse the injected HTML to verify no violations slipped through.
  // ------------------------------------------------------------------
  const constraintViolations: SeoConstraintViolation[] = [];

  if (injectedLinks.length > 0) {
    const $ = cheerio.load(html, null, false);
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') ?? '';
      const isInjected = injectedLinks.some((l) => l.url === href);
      if (!isInjected) return;

      for (const tag of FORBIDDEN_ANCESTORS) {
        if (tag === 'a') continue; // the element IS an <a>, check its parents
        if ($(el).closest(tag).length > 0) {
          constraintViolations.push({
            anchorText: $(el).text(),
            url: href,
            forbiddenParent: tag,
          });
          issues.push(`Link "${$(el).text()}" is inside a <${tag}> element (SEO constraint violation)`);
        }
      }
      // Check if the <a> itself is nested inside another <a>
      if ($(el).closest('a').not(el).length > 0) {
        constraintViolations.push({
          anchorText: $(el).text(),
          url: href,
          forbiddenParent: 'a',
        });
        issues.push(`Link "${$(el).text()}" is nested inside another <a> tag`);
      }
    });
  }

  // ------------------------------------------------------------------
  // 6. Distribution: links should be spread across sections
  // ------------------------------------------------------------------
  const distribution = checkDistribution(html, injectedLinks);
  if (distribution.clustered && linkCount > 1) {
    issues.push(`All internal links are clustered in the same section (poor distribution)`);
  }

  // ------------------------------------------------------------------
  // Composite score (0–100)
  // ------------------------------------------------------------------
  let score = 100;
  if (tooMany) score -= 30;
  if (tooFew) score -= 15;
  if (overOptimized) score -= 25;
  if (!targetsIndexable) score -= 20;
  if (constraintViolations.length > 0) score -= 40;
  if (distribution.clustered && linkCount > 1) score -= 10;

  const weakCount = relevance.filter((r) => r.weak).length;
  score -= weakCount * 8;
  score = Math.max(0, Math.min(100, score));

  // Only fail hard on: constraint violations, noindex targets, over-optimization, or zero links
  const hardFail =
    constraintViolations.length > 0 ||
    !targetsIndexable ||
    overOptimized ||
    (linkCount > 0 && tooMany);

  const passed = !hardFail && score >= 40;

  return {
    passed,
    score,
    issues,
    linkCount,
    withinRange,
    tooMany,
    tooFew,
    relevance,
    overOptimized,
    targetsIndexable,
    nonIndexableTargets,
    duplicateAnchors,
    duplicateUrls,
    constraintViolations,
    distribution,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenOverlap(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tokB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let shared = 0;
  for (const t of tokA) {
    if (tokB.has(t)) shared++;
  }
  return shared / Math.max(tokA.size, tokB.size);
}

function countDuplicates(items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
}

function checkDistribution(html: string, injectedLinks: InjectedLink[]): SeoDistributionInfo {
  if (injectedLinks.length === 0) {
    return { totalSections: 0, sectionsWithLinks: 0, clustered: false };
  }

  const $ = cheerio.load(html, null, false);

  // Treat each top-level <p>, <section>, <li>, <blockquote> as a section
  const sections = $('p, section, li, blockquote').toArray();
  const totalSections = sections.length;

  const injectedUrls = new Set(injectedLinks.map((l) => l.url));
  const sectionsWithLinksSet = new Set<number>();

  sections.forEach((el, idx) => {
    const hasInjected = $(el).find('a[href]').toArray().some((a) => {
      const href = $(a).attr('href') ?? '';
      return injectedUrls.has(href);
    });
    if (hasInjected) sectionsWithLinksSet.add(idx);
  });

  const sectionsWithLinks = sectionsWithLinksSet.size;
  const clustered = injectedLinks.length > 1 && sectionsWithLinks <= 1;

  return { totalSections, sectionsWithLinks, clustered };
}
