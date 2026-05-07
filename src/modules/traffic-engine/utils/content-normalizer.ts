/**
 * Fixes double-escaped sequences sometimes returned by LLMs or introduced
 * when content is round-tripped through JSON. Does not alter valid HTML
 * produced by markdown renderers (those are separate from this string).
 */
export function normalizeContentOutput(content: string): string {
  if (!content) {
    return '';
  }
  return content
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .trim();
}

/**
 * Some models wrap markdown in `{ "title", "content" }`. Extract inner markdown when obvious.
 * Handles invalid JSON where "content" contains literal newlines (models often emit this).
 */
export function unwrapJsonArticleWrapper(content: string): string {
  const t = content.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) {
    return content;
  }
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>;
    const inner =
      (typeof parsed.content === 'string' && parsed.content.trim()) ||
      (typeof parsed.markdown === 'string' && parsed.markdown.trim()) ||
      (typeof parsed.body === 'string' && parsed.body.trim()) ||
      '';
    if (inner && (/^#{1,6}\s/m.test(inner) || inner.includes('\n##'))) {
      return inner;
    }
  } catch {
    const loose = extractLooseJsonContentField(t);
    if (loose && (/^#{1,6}\s/m.test(loose) || loose.includes('\n##'))) {
      return loose.trim();
    }
  }
  return content;
}

/** When JSON.parse fails: find "content": "…" value up to closing `"\n}` (invalid JSON with raw newlines in value). */
function extractLooseJsonContentField(blob: string): string | null {
  const m = /"content"\s*:\s*"/.exec(blob);
  if (!m) {
    return null;
  }
  const start = m.index + m[0].length;
  let end = -1;
  for (const hit of blob.matchAll(/"\n\s*\}/g)) {
    if (hit.index !== undefined && hit.index >= start) {
      end = hit.index;
    }
  }
  if (end === -1 || end <= start) {
    return null;
  }
  return blob.slice(start, end);
}
