import { KeywordIntent } from '@prisma/client';

export interface ClusterKeyword {
  id: string;
  keyword: string;
  language: string;
  weight: number;
}

export interface KeywordClusterData {
  id: string;
  siteId: string;
  mainKeywordId: string;
  primaryKeyword: string;
  language: string;
  intent: KeywordIntent;
  topic: string;
  secondaryKeywords: ClusterKeyword[];
  semanticTopics: string[];
}

export interface CoverageResult {
  primaryCoverage: number;
  secondaryCoverage: number;
  semanticCoverage: number;
  missingKeywords: string[];
  missingSemanticTopics: string[];
  overallScore: number;
}
