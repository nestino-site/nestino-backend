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

export interface MetaLengthGateInput {
  metaTitle?: string | null;
  metaDescription?: string | null;
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
