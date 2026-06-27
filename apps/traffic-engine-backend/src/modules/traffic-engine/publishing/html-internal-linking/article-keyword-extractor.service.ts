/**
 * Extracts 3–5 high-value SEO keyword phrases from an article's HTML content.
 *
 * Primary path: deepseek-v4-flash via OpenModel (same client as clinic enrichment).
 * Fallback path: deterministic n-gram frequency analysis over visible text when
 *   OPENMODEL_API_KEY is absent or the LLM call fails.  Publishing is never blocked.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import {
  LLM_CLIENT,
  LlmClient,
} from '../../../clinic-inventory/clinics/enrichment/llm/llm-client.interface';
import type { ExtractedKeyword } from './html-internal-linking.types';

const MIN_KEYWORDS = 3;
const MAX_KEYWORDS = 5;
const MIN_PHRASE_CHARS = 4;

// ---------------------------------------------------------------------------
// LLM response schema
// ---------------------------------------------------------------------------

const LlmKeywordsSchema = z.object({
  keywords: z
    .array(
      z.object({
        phrase: z.string().min(2),
        weight: z.number().int().min(1).max(5),
      }),
    )
    .min(1)
    .max(10),
});

type LlmKeywordsResponse = z.infer<typeof LlmKeywordsSchema>;

@Injectable()
export class ArticleKeywordExtractorService {
  private readonly logger = new Logger(ArticleKeywordExtractorService.name);

  constructor(@Inject(LLM_CLIENT) private readonly llm: LlmClient) {}

  /**
   * Extract 3–5 high-value SEO keyword phrases from the HTML content.
   * Always resolves (never throws); falls back to heuristic on LLM errors.
   */
  async extract(html: string): Promise<ExtractedKeyword[]> {
    const visibleText = this.stripToText(html);

    if (visibleText.trim().length < 100) {
      this.logger.warn('html-internal-linking: article too short for keyword extraction');
      return [];
    }

    try {
      const llmResult = await this.extractWithLlm(visibleText);
      if (llmResult.length >= MIN_KEYWORDS) {
        return llmResult;
      }
      this.logger.warn(
        `html-internal-linking: LLM returned only ${llmResult.length} keywords, falling back to heuristic`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`html-internal-linking: LLM keyword extraction failed (${msg}), using heuristic fallback`);
    }

    return this.extractHeuristic(visibleText);
  }

  // ---------------------------------------------------------------------------
  // Private: LLM path
  // ---------------------------------------------------------------------------

  private async extractWithLlm(visibleText: string): Promise<ExtractedKeyword[]> {
    const truncated = visibleText.slice(0, 4000);

    const system = `You are an SEO expert. Extract the ${MIN_KEYWORDS}–${MAX_KEYWORDS} most important, high-value keyword phrases from the provided article text.

Rules:
- Return ONLY a valid JSON object matching the schema below. No markdown fences, no extra text.
- Mix of phrase lengths: include 1–2 word short phrases (city names, treatment names, specialties) AND 3–5 word descriptive phrases.
- Every phrase MUST appear verbatim (or near-verbatim) in the article text — these are used as anchor text.
- Weight: 5 = primary topic, 4 = major subtopic, 3 = supporting topic, 1–2 = secondary.
- Prioritise: city/location names, medical specialty names, treatment types, condition names.
- Do NOT include brand names, clinic names, URLs, or phone numbers.

JSON schema:
{
  "keywords": [
    { "phrase": "string", "weight": 1|2|3|4|5 }
  ]
}`;

    const user = `Article text:\n\n${truncated}`;

    const raw = await this.llm.completeJson({ system, user });
    const cleaned = stripJsonFences(raw);
    const parsed: unknown = JSON.parse(cleaned);
    const validated: LlmKeywordsResponse = LlmKeywordsSchema.parse(parsed);

    return validated.keywords
      .slice(0, MAX_KEYWORDS)
      .map((k) => ({ phrase: k.phrase.trim(), weight: k.weight, source: 'llm' as const }));
  }

  // ---------------------------------------------------------------------------
  // Private: heuristic fallback (n-gram frequency)
  // ---------------------------------------------------------------------------

  private extractHeuristic(text: string): ExtractedKeyword[] {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ');
    const words = normalized.split(/\s+/).filter((w) => w.length >= 2);

    const stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your', 'we',
      'our', 'they', 'their', 'if', 'then', 'than', 'so', 'yet', 'both', 'either', 'not',
      'more', 'most', 'also', 'very', 'just', 'about', 'which', 'what', 'when', 'where',
      'how', 'who', 'all', 'each', 'other', 'into', 'after', 'before', 'because',
    ]);

    const freq = new Map<string, number>();

    // Unigrams (non-stopword)
    for (const word of words) {
      if (!stopwords.has(word) && word.length >= MIN_PHRASE_CHARS) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
      }
    }

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i];
      const w2 = words[i + 1];
      if (!stopwords.has(w1) && !stopwords.has(w2)) {
        const bigram = `${w1} ${w2}`;
        freq.set(bigram, (freq.get(bigram) ?? 0) + 1);
      }
    }

    // Trigrams
    for (let i = 0; i < words.length - 2; i++) {
      const w1 = words[i];
      const w2 = words[i + 1];
      const w3 = words[i + 2];
      if (!stopwords.has(w1) && !stopwords.has(w3)) {
        const trigram = `${w1} ${w2} ${w3}`;
        freq.set(trigram, (freq.get(trigram) ?? 0) + 1);
      }
    }

    const sorted = Array.from(freq.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => {
        // Prefer longer phrases at same frequency
        const freqDiff = b[1] - a[1];
        if (freqDiff !== 0) return freqDiff;
        return b[0].split(' ').length - a[0].split(' ').length;
      })
      .slice(0, MAX_KEYWORDS);

    if (sorted.length < MIN_KEYWORDS) {
      // Fall back to top unigrams if we don't have enough repeated phrases
      const unigrams = Array.from(freq.entries())
        .filter(([phrase]) => !phrase.includes(' '))
        .sort((a, b) => b[1] - a[1]);

      for (const [phrase, count] of unigrams) {
        if (sorted.length >= MAX_KEYWORDS) break;
        if (!sorted.find(([p]) => p === phrase) && count >= 1) {
          sorted.push([phrase, count]);
        }
      }
    }

    return sorted.map(([phrase, count], idx) => ({
      phrase,
      weight: Math.max(1, Math.min(5, MAX_KEYWORDS - idx)) as 1 | 2 | 3 | 4 | 5,
      source: 'heuristic' as const,
      _count: count,
    })).map(({ phrase, weight, source }) => ({ phrase, weight, source }));
  }

  // ---------------------------------------------------------------------------
  // Private: HTML → visible text
  // ---------------------------------------------------------------------------

  private stripToText(html: string): string {
    const $ = cheerio.load(html, null, false);
    // Remove script/style/nav/footer from text extraction
    $('script, style, nav, footer, .nav, .footer').remove();
    return $.root().text().replace(/\s+/g, ' ').trim();
  }
}

function stripJsonFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}
