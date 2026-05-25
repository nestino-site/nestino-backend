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
