import { Injectable } from '@nestjs/common';
import { CoverageResult, KeywordClusterData } from './keyword-cluster.types';

@Injectable()
export class ContentCoverageEngineService {
  analyzeCoverage(content: string, cluster: KeywordClusterData): CoverageResult {
    const normalized = content.toLowerCase();

    // Primary coverage: keyword appears at least twice for good density
    const primaryPresent = normalized.includes(cluster.primaryKeyword.toLowerCase());
    const primaryCoverage = primaryPresent ? 1 : 0;

    // Secondary coverage: how many secondary keywords appear in content
    const secondaryKeywords = cluster.secondaryKeywords;
    if (secondaryKeywords.length === 0) {
      return {
        primaryCoverage,
        secondaryCoverage: 1,
        semanticCoverage: this.computeSemanticCoverage(normalized, cluster.semanticTopics),
        missingKeywords: [],
        missingSemanticTopics: this.findMissing(normalized, cluster.semanticTopics),
        overallScore: primaryCoverage,
      };
    }

    const presentSecondary = secondaryKeywords.filter((kw) =>
      normalized.includes(kw.keyword.toLowerCase()),
    );
    const missingKeywords = secondaryKeywords
      .filter((kw) => !normalized.includes(kw.keyword.toLowerCase()))
      .map((kw) => kw.keyword);

    const weightedCoverage =
      presentSecondary.reduce((sum, kw) => sum + kw.weight, 0) /
      secondaryKeywords.reduce((sum, kw) => sum + kw.weight, 0);
    const secondaryCoverage = Number(weightedCoverage.toFixed(2));

    // Semantic coverage: how many semantic topics appear
    const semanticCoverage = this.computeSemanticCoverage(normalized, cluster.semanticTopics);
    const missingSemanticTopics = this.findMissing(normalized, cluster.semanticTopics);

    const overallScore = Number(
      (primaryCoverage * 0.4 + secondaryCoverage * 0.35 + semanticCoverage * 0.25).toFixed(2),
    );

    return {
      primaryCoverage,
      secondaryCoverage,
      semanticCoverage,
      missingKeywords,
      missingSemanticTopics,
      overallScore,
    };
  }

  private computeSemanticCoverage(normalizedContent: string, semanticTopics: string[]): number {
    if (semanticTopics.length === 0) return 1;
    const present = semanticTopics.filter((topic) =>
      this.topicPartiallyPresent(normalizedContent, topic),
    ).length;
    return Number((present / semanticTopics.length).toFixed(2));
  }

  private findMissing(normalizedContent: string, topics: string[]): string[] {
    return topics.filter((topic) => !this.topicPartiallyPresent(normalizedContent, topic));
  }

  // A topic is considered "present" if at least half of its significant words appear in content
  private topicPartiallyPresent(content: string, topic: string): boolean {
    const words = topic
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (words.length === 0) return content.includes(topic.toLowerCase());
    const matched = words.filter((w) => content.includes(w)).length;
    return matched / words.length >= 0.5;
  }
}
