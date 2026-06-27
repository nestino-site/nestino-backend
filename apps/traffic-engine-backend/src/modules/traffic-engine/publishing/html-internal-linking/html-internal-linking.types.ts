/**
 * Shared types for the HTML internal-linking module.
 * All interfaces are strictly typed; no `any`.
 */

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

export interface ExtractedKeyword {
  /** The keyword/phrase as extracted from the article */
  phrase: string;
  /** Relative relevance weight (1–5, higher = more important) */
  weight: number;
  /** Which extraction path produced this: 'llm' | 'heuristic' */
  source: 'llm' | 'heuristic';
}

// ---------------------------------------------------------------------------
// Link targets (from DB lookup)
// ---------------------------------------------------------------------------

export interface InternalLinkTarget {
  pageId: number;
  slug: string;
  title: string | null;
  /** The page's primary keyword.keyword string */
  primaryKeyword: string;
  /** Relevance score computed during candidate ranking */
  relevanceScore: number;
  /** Fully qualified URL e.g. https://medcover.io/guides/foo/ */
  url: string;
  /**
   * robotsMeta of the target page — used by the SEO report to confirm the
   * target is indexable (i.e. does NOT contain "noindex").
   */
  robotsMeta: string | null;
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

export interface InjectLinksOptions {
  html: string;
  siteId: number;
  currentPageId: number;
  domain: string;
  /** Maximum number of links to inject (capped at 4, minimum target 3). Default 4. */
  maxLinks?: number;
}

export interface InjectedLink {
  /** Anchor text as it appears in the final HTML */
  anchorText: string;
  url: string;
  /** title attribute value on the <a> tag */
  title: string;
  pageId: number;
  primaryKeyword: string;
}

export interface InjectLinksResult {
  /** The HTML string after injection (equals input html when nothing was injected or on error) */
  html: string;
  linksInjected: number;
  injectedLinks: InjectedLink[];
  /** Full SEO quality report for this injection pass */
  report: SeoLinkingReport;
}

// ---------------------------------------------------------------------------
// Preview / dry-run (no DB write)
// ---------------------------------------------------------------------------

export interface PreviewResult {
  pageId: number;
  extractedKeywords: ExtractedKeyword[];
  candidateTargets: InternalLinkTarget[];
  proposedLinks: InjectedLink[];
  /** Snippet of the original HTML for quick visual inspection (first 2000 chars) */
  htmlBefore: string;
  /** Snippet of the HTML after injection (first 2000 chars) */
  htmlAfter: string;
  report: SeoLinkingReport;
}

// ---------------------------------------------------------------------------
// SEO quality report
// ---------------------------------------------------------------------------

export interface SeoLinkRelevanceItem {
  anchorText: string;
  url: string;
  primaryKeyword: string;
  /** Token overlap ratio 0–1 between anchor and primaryKeyword */
  overlapScore: number;
  weak: boolean;
}

export interface SeoConstraintViolation {
  anchorText: string;
  url: string;
  /** The forbidden parent element tag (e.g. "h2", "a", "button") */
  forbiddenParent: string;
}

export interface SeoDistributionInfo {
  /** Total number of block-level paragraphs / sections in the HTML */
  totalSections: number;
  /** How many distinct sections contain an injected link */
  sectionsWithLinks: number;
  /** true if all links are in the same section (bad) */
  clustered: boolean;
}

export interface SeoLinkingReport {
  /** Overall pass/fail */
  passed: boolean;
  /** 0–100 composite score (higher = better) */
  score: number;
  /** Human-readable issue descriptions; empty when passed */
  issues: string[];

  // --- individual check results ---
  linkCount: number;
  withinRange: boolean;
  tooMany: boolean;
  tooFew: boolean;

  relevance: SeoLinkRelevanceItem[];
  overOptimized: boolean;

  /** All target pages are PUBLISHED and not noindex */
  targetsIndexable: boolean;
  nonIndexableTargets: string[];

  duplicateAnchors: string[];
  duplicateUrls: string[];

  constraintViolations: SeoConstraintViolation[];

  distribution: SeoDistributionInfo;
}
