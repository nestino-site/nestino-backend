import { Injectable } from '@nestjs/common';

export interface GeoPillarScores {
  evidenceDensity: number;
  structurePosition: number;
  authoritySignals: number;
  aiCrawlability: number;
}

export interface GeoScoreResult {
  total: number;
  pillars: GeoPillarScores;
  vetoes: string[];
}

@Injectable()
export class GeoScoringService {
  score(content: string, schemaMarkup: unknown, primaryKeyword: string): GeoScoreResult {
    const safeContent = content ?? '';
    const wordCount = this.countWords(safeContent);

    const evidenceDensity = this.scoreEvidenceDensity(safeContent, wordCount);
    const structurePosition = this.scoreStructureAndPosition(safeContent, primaryKeyword);
    const authoritySignals = this.scoreAuthoritySignals(safeContent);
    const aiCrawlability = this.scoreAiCrawlability(safeContent, schemaMarkup);

    const vetoes = this.collectVetoes(safeContent, schemaMarkup, primaryKeyword);
    let total = Math.round(evidenceDensity + structurePosition + authoritySignals + aiCrawlability);
    if (vetoes.length > 0 && total > 60) {
      total = 60;
    }

    return {
      total,
      pillars: {
        evidenceDensity: Math.round(evidenceDensity),
        structurePosition: Math.round(structurePosition),
        authoritySignals: Math.round(authoritySignals),
        aiCrawlability: Math.round(aiCrawlability),
      },
      vetoes,
    };
  }

  detectAdversarialAntiPatterns(content: string, primaryKeyword: string): string[] {
    const lower = (content ?? '').toLowerCase();
    const issues: string[] = [];

    if (this.keywordDensity(lower, primaryKeyword.toLowerCase()) > 0.01) {
      issues.push('keyword_stuffing');
    }
    if (/(experts say|studies show|leading provider|best-in-class|many factors)/i.test(lower)) {
      issues.push('vague_entities_or_superlatives');
    }
    if (/in today's (rapidly )?(digital )?landscape/i.test(lower)) {
      issues.push('filler_intro');
    }
    return issues;
  }

  private scoreEvidenceDensity(content: string, wordCount: number): number {
    let score = 0;
    const numbersWithUnits = content.match(/\b\d+(\.\d+)?\s?(%|\$|ms|px|x|kg|days?|hours?|weeks?|months?)\b/gi)?.length ?? 0;
    if (numbersWithUnits >= 5) score += 10;
    else score += Math.min(10, numbersWithUnits * 2);

    const citationCount = content.match(/https?:\/\/\S+|\([^)]+,\s*\d{4}\)/g)?.length ?? 0;
    const expectedCitations = Math.max(1, Math.ceil(wordCount / 500));
    if (citationCount >= expectedCitations) score += 10;
    else score += Math.min(10, (citationCount / expectedCitations) * 10);

    const quoteCount = content.match(/"[^"]{20,}"/g)?.length ?? 0;
    if (quoteCount >= 2) score += 8;
    else score += quoteCount * 4;

    const namedEntities = content.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g)?.length ?? 0;
    if (namedEntities >= 3) score += 7;
    else score += Math.min(7, namedEntities * 2.33);

    return Math.min(35, score);
  }

  private scoreStructureAndPosition(content: string, primaryKeyword: string): number {
    let score = 0;
    const first150 = this.firstWords(content, 150).toLowerCase();
    if (first150.includes(primaryKeyword.toLowerCase())) score += 6;
    if (/#\s*(tl;dr|key takeaways)/i.test(content)) score += 4;
    if (/^#\s+/m.test(content)) score += 4;
    if (/^##\s+/m.test(content) && !this.hasHeadingLevelSkip(content)) score += 4;
    if (/^##\s+faq\b/im.test(content)) score += 3;
    if (/\|.+\|.+\|/.test(content)) score += 2;
    if (this.averageSentencesPerParagraph(content) <= 4) score += 2;

    return Math.min(25, score);
  }

  private scoreAuthoritySignals(content: string): number {
    let score = 0;
    if (/\*by\s+[^\n]+\*/i.test(content) || /\*\*author:\*\*/i.test(content)) score += 8;
    if (/last updated|dateModified|updated:/i.test(content)) score += 8;
    if (/we tested|our analysis|we found|in our testing/i.test(content)) score += 9;
    return Math.min(25, score);
  }

  private scoreAiCrawlability(content: string, schemaMarkup: unknown): number {
    let score = 0;
    if (schemaMarkup != null) score += 4;
    const schemaText = JSON.stringify(schemaMarkup ?? {});
    if (/\"@type\"\s*:\s*\"(Article|BlogPosting)\"/.test(schemaText)) score += 4;
    if (/^##\s+faq\b/im.test(content) && /\"@type\"\s*:\s*\"FAQPage\"/.test(schemaText)) score += 4;
    if (/\"sameAs\"\s*:\s*\[/.test(schemaText)) score += 3;
    return Math.min(15, score);
  }

  private collectVetoes(content: string, schemaMarkup: unknown, primaryKeyword: string): string[] {
    const vetoes: string[] = [];
    if (!/^#\s+/m.test(content)) {
      vetoes.push('missing_h1');
    }
    if (schemaMarkup == null) {
      vetoes.push('missing_schema_markup');
    }
    if (!/\*by\s+[^\n]+\*/i.test(content) && !/\*\*author:\*\*/i.test(content)) {
      vetoes.push('missing_author_signal');
    }
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.toLowerCase() ?? '';
    if (heading && !heading.includes(primaryKeyword.toLowerCase())) {
      vetoes.push('title_content_intent_mismatch');
    }
    return vetoes;
  }

  private hasHeadingLevelSkip(content: string): boolean {
    const headingLevels = [...content.matchAll(/^(#{1,6})\s+/gm)].map((m) => m[1].length);
    for (let i = 1; i < headingLevels.length; i += 1) {
      if (headingLevels[i] - headingLevels[i - 1] > 1) {
        return true;
      }
    }
    return false;
  }

  private countWords(content: string): number {
    return content.split(/\s+/).filter(Boolean).length;
  }

  private firstWords(content: string, n: number): string {
    return content.split(/\s+/).filter(Boolean).slice(0, n).join(' ');
  }

  private averageSentencesPerParagraph(content: string): number {
    const paragraphs = content
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) return 0;
    const sentenceCounts = paragraphs.map((p) => (p.match(/[.!?]+/g)?.length ?? 1));
    return sentenceCounts.reduce((sum, v) => sum + v, 0) / paragraphs.length;
  }

  private keywordDensity(contentLower: string, keywordLower: string): number {
    const words = contentLower.split(/\s+/).filter(Boolean);
    if (words.length === 0 || !keywordLower.trim()) {
      return 0;
    }
    const pattern = new RegExp(`\\b${this.escapeRegExp(keywordLower)}\\b`, 'g');
    const count = contentLower.match(pattern)?.length ?? 0;
    return count / words.length;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
