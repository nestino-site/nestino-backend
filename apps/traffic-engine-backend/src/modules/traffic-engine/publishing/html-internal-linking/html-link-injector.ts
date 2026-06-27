/**
 * Pure, framework-agnostic cheerio utility for injecting internal <a> tags
 * into an HTML string.
 *
 * SEO constraints enforced:
 *  - Only the FIRST occurrence of each keyword phrase is linked.
 *  - Maximum `maxLinks` links per article (default 4, SEO best-practice 3-4).
 *  - NEVER inject inside: h1–h6, a, button, img, code, pre, figcaption.
 *  - Adds `title` attribute to every injected <a> for accessibility + SEO.
 *  - One link per destination URL.
 *  - Longest-first matching order to prevent partial matches stomping longer phrases.
 */
import * as cheerio from 'cheerio';
import type { AnyNode, Text } from 'domhandler';
import type { InjectedLink, InternalLinkTarget } from './html-internal-linking.types';

/** Tags inside which we must NEVER inject a link */
const FORBIDDEN_ANCESTORS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'img', 'code', 'pre', 'figcaption'];

export interface InjectorInput {
  html: string;
  targets: InternalLinkTarget[];
  maxLinks: number;
}

export interface InjectorOutput {
  html: string;
  injectedLinks: InjectedLink[];
}

export function injectInternalLinks(input: InjectorInput): InjectorOutput {
  const { html, maxLinks } = input;

  if (!html?.trim() || input.targets.length === 0) {
    return { html, injectedLinks: [] };
  }

  // Sort longest-first so "dental implants turkey" is matched before "dental"
  const targets = [...input.targets].sort(
    (a, b) =>
      (b.matchedKeyword || b.primaryKeyword).length -
      (a.matchedKeyword || a.primaryKeyword).length,
  );

  const $ = cheerio.load(html, null, false);

  const injectedLinks: InjectedLink[] = [];
  const usedUrls = new Set<string>();
  const usedPhrases = new Set<string>();

  for (const target of targets) {
    if (injectedLinks.length >= maxLinks) break;
    if (usedUrls.has(target.url)) continue;

    // Use the extracted keyword phrase that actually appears in the article text,
    // not the DB primaryKeyword which may not appear verbatim.
    const phrase = (target.matchedKeyword || target.primaryKeyword).trim();
    const phraseKey = phrase.toLowerCase();
    if (usedPhrases.has(phraseKey)) continue;

    const titleAttr = target.title?.trim() || target.primaryKeyword;
    const escaped = escapeRegex(phrase);
    // Word-boundary aware, case-insensitive
    const re = new RegExp(`(${escaped})`, 'i');

    let didInject = false;

    // Walk all text nodes in document order; stop at first successful injection
    $('*').each((_i, el) => {
      if (didInject || injectedLinks.length >= maxLinks) return false; // break

      // Only process actual element nodes
      if (el.type !== 'tag') return;

      // Check if this element is a forbidden ancestor itself
      if (FORBIDDEN_ANCESTORS.includes(el.name.toLowerCase())) return;

      // Walk direct child text nodes of this element
      const children = el.children ?? [];
      for (let ci = 0; ci < children.length; ci++) {
        const child = children[ci];
        if (child.type !== 'text') continue;

        const text: string = (child as Text).data ?? '';
        if (!re.test(text)) continue;

        // Double-check: is ANY ancestor forbidden?
        const $el = $(el);
        const inForbidden = FORBIDDEN_ANCESTORS.some((tag) => $el.closest(tag).length > 0);
        if (inForbidden) break; // skip this element entirely

        // Replace only the first occurrence in this text node
        const newText = text.replace(re, (_match, matched: string) => {
          return `<a href="${target.url}" title="${escapeHtmlAttr(titleAttr)}">${matched}</a>`;
        });

        // Parse inline HTML fragment; fragment mode has no <body>, so wrap briefly
        const $placeholder = cheerio.load(`<span>${newText}</span>`, null, false);
        const nodes = $placeholder('span').contents().toArray();
        if (nodes.length === 0) break;

        $(child).replaceWith(nodes as AnyNode[]);

        injectedLinks.push({
          anchorText: text.match(re)![1],
          url: target.url,
          title: titleAttr,
          pageId: target.pageId,
          primaryKeyword: target.primaryKeyword,
        });
        usedUrls.add(target.url);
        usedPhrases.add(phraseKey);
        didInject = true;
        break; // one injection per target
      }
    });
  }

  const resultHtml = $.html();
  return { html: resultHtml ?? html, injectedLinks };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
