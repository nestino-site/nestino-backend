const H1_PATTERN = /^#\s+(.+)$/m;

export function extractH1Text(content: string): string | null {
  const match = content.match(H1_PATTERN);
  return match ? match[1].trim() : null;
}

export function h1ContainsKeyword(content: string, keyword: string): boolean {
  const h1 = extractH1Text(content);
  if (!h1) {
    return false;
  }
  return h1.toLowerCase().includes(keyword.toLowerCase());
}

/** Prepends keyword to H1 when missing. Returns null if no H1 exists. */
export function ensureKeywordInH1(content: string, keyword: string): string | null {
  const match = content.match(H1_PATTERN);
  if (!match) {
    return null;
  }
  const h1Text = match[1].trim();
  if (h1Text.toLowerCase().includes(keyword.toLowerCase())) {
    return content;
  }
  return content.replace(H1_PATTERN, `# ${keyword}: ${h1Text}`);
}

export const META_TITLE_MIN = 30;
export const META_TITLE_MAX = 65;
export const META_DESC_MIN = 80;
export const META_DESC_MAX = 165;

export interface MetaLengthGateInput {
  metaTitle?: string | null;
  metaDescription?: string | null;
}

/** Trim meta title to the SEO gate range (30–65 chars). */
export function clampMetaTitle(metaTitle: string): string {
  const trimmed = metaTitle.trim();
  if (trimmed.length >= META_TITLE_MIN && trimmed.length <= META_TITLE_MAX) {
    return trimmed;
  }
  if (trimmed.length > META_TITLE_MAX) {
    const withoutBrand = trimmed.replace(/\s*[|–—-]\s*MedCover\s*$/i, '').trim();
    if (withoutBrand.length >= META_TITLE_MIN && withoutBrand.length <= META_TITLE_MAX) {
      return withoutBrand;
    }
    const slice = trimmed.slice(0, META_TITLE_MAX);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace >= META_TITLE_MIN) {
      return slice.slice(0, lastSpace).trim();
    }
    return slice.trim();
  }
  return trimmed;
}

/** Trim meta description to the SEO gate range (80–165 chars). */
export function clampMetaDescription(metaDescription: string): string {
  const trimmed = metaDescription.trim();
  if (trimmed.length >= META_DESC_MIN && trimmed.length <= META_DESC_MAX) {
    return trimmed;
  }
  if (trimmed.length > META_DESC_MAX) {
    const slice = trimmed.slice(0, META_DESC_MAX);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace >= META_DESC_MIN) {
      return slice.slice(0, lastSpace).trim();
    }
    return slice.trim();
  }
  return trimmed;
}

export function normalizeMetaForSeoGate(meta: MetaLengthGateInput): {
  metaTitle: string | null | undefined;
  metaDescription: string | null | undefined;
  changed: boolean;
} {
  let changed = false;
  let metaTitle = meta.metaTitle;
  let metaDescription = meta.metaDescription;

  if (metaTitle) {
    const clamped = clampMetaTitle(metaTitle);
    if (clamped !== metaTitle) {
      metaTitle = clamped;
      changed = true;
    }
  }
  if (metaDescription) {
    const clamped = clampMetaDescription(metaDescription);
    if (clamped !== metaDescription) {
      metaDescription = clamped;
      changed = true;
    }
  }

  return { metaTitle, metaDescription, changed };
}

export function collectDeterministicSeoIssues(
  content: string,
  keyword: string,
  meta: MetaLengthGateInput,
): string[] {
  const issues: string[] = [];
  const h1 = extractH1Text(content);
  if (h1 && !h1.toLowerCase().includes(keyword.toLowerCase())) {
    issues.push('Primary keyword missing from H1');
  }
  if (meta.metaTitle) {
    const len = meta.metaTitle.length;
    if (len < 30 || len > 65) {
      issues.push(`Meta title length ${len} is outside 30–65 characters`);
    }
  }
  if (meta.metaDescription) {
    const len = meta.metaDescription.length;
    if (len < 80 || len > 165) {
      issues.push(`Meta description length ${len} is outside 80–165 characters`);
    }
  }
  return issues;
}

import { contentGeoMisaligned, GUIDE_TREATMENT_SLUGS } from '../content-api/seo/guide-geo.util';
import { parseGuideEntitiesFromSlugParts } from '../content-api/seo/page-type.util';

const CONTENT_STOP_WORDS = new Set([
  'ivf',
  'vs',
  'for',
  'in',
  'the',
  'a',
  'guide',
  'compare',
  'cost',
  'clinic',
  'and',
  'or',
  'hair',
  'transplant',
  'restoration',
  'fue',
  'dhi',
  'fut',
]);

/** Topic tokens derived from keyword + slug (e.g. prague, brno for city compare pages). */
export function extractPageTopicTokens(keyword: string, slug: string): string[] {
  const tokens = new Set<string>();

  for (const part of keyword.toLowerCase().split(/[\s/\-_]+/)) {
    if (part.length > 2 && !CONTENT_STOP_WORDS.has(part)) {
      tokens.add(part);
    }
  }

  const normalizedSlug = slug.replace(/^\/+|\/+$/g, '');
  const slugParts = normalizedSlug.split('/').filter(Boolean);
  if (slugParts[0] === 'guides') {
    const entities = parseGuideEntitiesFromSlugParts(
      slugParts.slice(1),
      GUIDE_TREATMENT_SLUGS,
    );
    for (const geoSlug of [entities.city?.slug, entities.country?.slug]) {
      if (!geoSlug) continue;
      for (const part of geoSlug.split('-')) {
        if (part.length > 2 && !CONTENT_STOP_WORDS.has(part)) {
          tokens.add(part);
        }
      }
    }
  }

  const slugLeaf = slugParts[slugParts.length - 1] ?? '';
  const compareMatch = slugLeaf.match(/^(.+)-vs-(.+)-ivf$/);
  if (compareMatch) {
    for (const city of [compareMatch[1], compareMatch[2]]) {
      for (const part of city.split('-')) {
        if (part.length > 2 && !CONTENT_STOP_WORDS.has(part)) {
          tokens.add(part);
        }
      }
    }
  }

  return [...tokens];
}

/**
 * Detects when persisted draft/final content belongs to a different page topic
 * (e.g. Athens guide body stored on Prague compare page after a bad resume).
 */
export function contentAlignsWithPage(
  content: string,
  keyword: string,
  slug: string,
): boolean {
  if (contentGeoMisaligned(content, slug)) {
    return false;
  }

  const tokens = extractPageTopicTokens(keyword, slug);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = content.toLowerCase();
  const matched = tokens.filter((token) => haystack.includes(token));
  const isComparison = keyword.includes(' vs ') || slug.includes('-vs-');
  const requiredMatches = isComparison ? Math.min(2, tokens.length) : 1;

  if (matched.length < requiredMatches) {
    return false;
  }

  const normalizedSlug = slug.replace(/^\/+|\/+$/g, '');
  const slugParts = normalizedSlug.split('/').filter(Boolean);
  if (slugParts[0] === 'guides' && slugParts.length >= 3) {
    const entities = parseGuideEntitiesFromSlugParts(
      slugParts.slice(1),
      GUIDE_TREATMENT_SLUGS,
    );
    if (entities.city?.slug) {
      const cityTokens = entities.city.slug
        .split('-')
        .filter((part) => part.length > 2 && !CONTENT_STOP_WORDS.has(part));
      if (cityTokens.length > 0) {
        return cityTokens.every((token) => haystack.includes(token));
      }
    }
  }

  return true;
}
