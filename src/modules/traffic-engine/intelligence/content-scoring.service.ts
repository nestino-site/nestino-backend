import { Injectable } from '@nestjs/common';
import { KeywordIntent } from '@prisma/client';

export interface ContentScoreResult {
  seoScore: number;
  readabilityScore: number;
  intentMatch: number;
  contentDepth: number;
  redundancyScore: number;
  gaps: string[];
  issues: string[];
}

/** Deterministic 0–100 signals for E-E-A-T style analysis (AI may override when valid). */
export interface EeatDimensionScores {
  /** Higher = stronger on-the-ground / observational signals. */
  experienceScore: number;
  /** Higher = more generic / templated (BAD). */
  genericContentScore: number;
  /** Higher = more distinct, non-repetitive information. */
  informationGainScore: number;
  /** Composite trust / specificity / experience alignment. */
  eeatSignalScore: number;
}

const GENERIC_PHRASE_PATTERNS: RegExp[] = [
  /\bvibrant (?:capital|culture)\b/i,
  /\brich in history\b/i,
  /\bperfect stay\b/i,
  /\bluxury experience\b/i,
  /\bstunning views?\b/i,
  /\bperfect blend\b/i,
  /\bideal choice\b/i,
  /\bluxury and comfort\b/i,
  /\bwhether you(?:'re| are) (?:visiting|traveling)\b/i,
  /\bunique blends?\b/i,
  /\bsomething for everyone\b/i,
  /\bhidden gems?\b/i,
  /\bworld[- ]class amenities\b/i,
  /\bunforgettable stay\b/i,
  /\bbustling heart\b/i,
  /\btapestry of\b/i,
  /\bgateway to\b/i,
  /\bcultural heritages?\b/i,
];

const EXPERIENCE_HINT_PATTERNS: RegExp[] = [
  /\$\d|\d+\s*(?:usd|eur|gbp|iqd)\b/i,
  /\d+\s*(?:km|mi|m|min|minutes?|hours?|blocks?)\b/i,
  /\b(?:check[- ]?in|checkout|lobby|reception|noise|quiet|busy|rush hour|evening|morning)\b/i,
  /\b(?:walk|walking distance|short drive|nearby|around the corner)\b/i,
];

@Injectable()
export class ContentScoringService {
  score(
    draft: string,
    keyword: string,
    outline: Record<string, unknown> | null,
    intent: KeywordIntent,
  ): ContentScoreResult {
    const words = this.tokenize(draft);
    const sentences = draft.split(/[.!?]+/).map((line) => line.trim()).filter(Boolean);
    const keywordDensity = this.computeKeywordDensity(words, keyword);
    const readabilityScore = this.computeReadability(sentences, words.length);
    const redundancyScore = this.computeRedundancy(sentences);
    const gaps = this.detectContentGaps(draft, outline);
    const intentMatch = this.computeIntentAlignment(draft, intent);
    const contentDepth = Math.max(0, Math.min(1, 1 - gaps.length * 0.2));

    const seoScoreRaw =
      keywordDensity * 50 + readabilityScore * 0.3 + intentMatch * 20 + contentDepth * 20;
    const seoScore = Math.max(0, Math.min(100, Number(seoScoreRaw.toFixed(2))));
    const issues: string[] = [];
    if (readabilityScore < 50) issues.push('low_readability');
    if (redundancyScore > 0.25) issues.push('high_redundancy');
    if (gaps.length > 0) issues.push('content_gaps');
    if (intentMatch < 0.6) issues.push('weak_intent_alignment');

    return {
      seoScore,
      readabilityScore: Number(readabilityScore.toFixed(2)),
      intentMatch: Number(intentMatch.toFixed(2)),
      contentDepth: Number(contentDepth.toFixed(2)),
      redundancyScore: Number(redundancyScore.toFixed(2)),
      gaps,
      issues,
    };
  }

  /**
   * Heuristic E-E-A-T–style dimensions from draft text (used when model omits fields or for calibration).
   * genericContentScore: higher = worse (more templated / cliché).
   */
  scoreEeatDimensions(draft: string): EeatDimensionScores {
    const text = draft.trim();
    if (!text) {
      return {
        experienceScore: 0,
        genericContentScore: 100,
        informationGainScore: 0,
        eeatSignalScore: 0,
      };
    }
    let genericHits = 0;
    for (const re of GENERIC_PHRASE_PATTERNS) {
      const hits = text.match(new RegExp(re.source, 'gi'));
      if (hits) {
        genericHits += hits.length;
      }
    }
    const genericContentScore = Math.min(100, genericHits * 14 + Math.round(this.computeRedundancy(text.split(/[.!?]+/).map((l) => l.trim()).filter(Boolean)) * 40));

    let expHits = 0;
    for (const re of EXPERIENCE_HINT_PATTERNS) {
      if (re.test(text)) {
        expHits += 1;
      }
    }
    const digits = (text.match(/\d/g) ?? []).length;
    const experienceScore = Math.min(100, expHits * 12 + Math.min(40, Math.round(digits / 3)));

    const words = this.tokenize(text);
    const unique = new Set(words);
    const typeTokenRatio = words.length ? unique.size / words.length : 0;
    const sentences = text.split(/[.!?]+/).map((l) => l.trim()).filter(Boolean);
    const lengthVariety = sentences.length > 2 ? Math.min(1, this.stdDev(sentences.map((s) => s.split(/\s+/).length)) / 8) : 0.2;
    const informationGainScore = Math.min(
      100,
      Math.round(typeTokenRatio * 55 + lengthVariety * 30 + Math.min(15, sentences.length)),
    );

    const eeatSignalScore = Math.min(
      100,
      Math.round(
        experienceScore * 0.38 + (100 - genericContentScore) * 0.32 + informationGainScore * 0.3,
      ),
    );

    return {
      experienceScore,
      genericContentScore,
      informationGainScore,
      eeatSignalScore,
    };
  }

  private stdDev(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
    return Math.sqrt(v);
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/gi, '')).filter(Boolean);
  }

  private computeKeywordDensity(words: string[], keyword: string): number {
    if (words.length === 0) return 0;
    const keywordTokens = this.tokenize(keyword);
    if (keywordTokens.length === 0) return 0;
    const joined = words.join(' ');
    const keywordPhrase = keywordTokens.join(' ');
    const matches = joined.split(keywordPhrase).length - 1;
    const density = (matches * keywordTokens.length) / words.length;
    return Math.max(0, Math.min(1, density * 8));
  }

  private computeReadability(sentences: string[], wordCount: number): number {
    if (sentences.length === 0 || wordCount === 0) return 0;
    const avgSentenceLength = wordCount / sentences.length;
    const score = 100 - Math.max(0, (avgSentenceLength - 16) * 3.2);
    return Math.max(10, Math.min(100, score));
  }

  private computeRedundancy(sentences: string[]): number {
    if (sentences.length < 2) return 0;
    let duplicates = 0;
    const normalized = sentences.map((line) =>
      line.toLowerCase().replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim(),
    );
    const seen = new Set<string>();
    for (const sentence of normalized) {
      const signature = sentence.split(' ').slice(0, 8).join(' ');
      if (seen.has(signature)) {
        duplicates += 1;
      }
      seen.add(signature);
    }
    return duplicates / sentences.length;
  }

  private detectContentGaps(draft: string, outline: Record<string, unknown> | null): string[] {
    const gaps: string[] = [];
    const h2s = Array.isArray(outline?.h2s) ? (outline?.h2s as string[]) : [];
    const normalizedDraft = draft.toLowerCase();
    for (const heading of h2s) {
      const headingToken = heading.toLowerCase().trim();
      if (headingToken.length === 0) continue;
      if (!normalizedDraft.includes(headingToken)) {
        gaps.push(heading);
      }
    }
    return gaps;
  }

  private computeIntentAlignment(draft: string, intent: KeywordIntent): number {
    const value = draft.toLowerCase();
    if (intent === KeywordIntent.TRANSACTIONAL) {
      return this.containsAny(value, ['book now', 'price', 'contact', 'reserve']) ? 0.9 : 0.5;
    }
    if (intent === KeywordIntent.NAVIGATIONAL) {
      return this.containsAny(value, ['official', 'website', 'location']) ? 0.85 : 0.5;
    }
    if (intent === KeywordIntent.COMMERCIAL) {
      return this.containsAny(value, ['compare', 'best', 'review']) ? 0.85 : 0.5;
    }
    return this.containsAny(value, ['guide', 'how', 'what']) ? 0.85 : 0.6;
  }

  private containsAny(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
  }
}
