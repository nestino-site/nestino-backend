import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AnalysisSchema, safeParse } from '../ai/schemas/structured-output.schemas';
import { AiExecutionService } from '../ai/execution/ai-execution.service';
import { SiteConfigRecord } from '../config/config.types';
import { ContentScoringService } from '../intelligence/content-scoring.service';
import { ContentCoverageEngineService } from '../intelligence/keyword-intelligence/content-coverage-engine.service';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';

export interface AnalysisResult {
  seoScore: number;
  readabilityScore: number;
  intentMatch: number;
  contentDepth: number;
  redundancyScore: number;
  keywordCoverageScore: number;
  semanticDepthScore: number;
  /** 0–100: observational / on-the-ground signals (higher = better). */
  experienceScore: number;
  /** 0–100: templated / generic phrasing (higher = worse). */
  genericContentScore: number;
  /** 0–100: non-repetitive, distinctive information (higher = better). */
  informationGainScore: number;
  /** 0–100: composite E-E-A-T alignment (higher = better). */
  eeatSignalScore: number;
  gaps: string[];
  missingKeywords: string[];
  issues: string[];
}

function pickScore(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
  return fallback;
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiExecution: AiExecutionService,
    private readonly scoring: ContentScoringService,
    private readonly coverageEngine: ContentCoverageEngineService,
  ) {}

  async analyze(
    pageId: number,
    siteId: number,
    draft: string,
    outline: Record<string, unknown>,
    cluster: KeywordClusterData,
    priority: number,
    config: SiteConfigRecord,
  ): Promise<AnalysisResult> {
    const eeatDims = this.scoring.scoreEeatDimensions(draft);

    const aiOutput = await this.aiExecution.execute({
      step: 'analyze',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: {
        draftText: draft,
        briefJson: outline,
        keyword: cluster.primaryKeyword,
        secondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
        semanticTopics: cluster.semanticTopics,
      },
      maxOutputTokens: 1400,
    });

    const deterministic = this.scoring.score(draft, cluster.primaryKeyword, outline, cluster.intent);
    const coverage = this.coverageEngine.analyzeCoverage(draft, cluster);

    const validated = safeParse(AnalysisSchema, aiOutput.text);
    let aiParsed: Record<string, unknown>;
    if (validated) {
      aiParsed = validated as Record<string, unknown>;
    } else {
      try {
        aiParsed = JSON.parse(aiOutput.text) as Record<string, unknown>;
      } catch {
        aiParsed = {};
      }
    }

    const aiIssues = Array.isArray(aiParsed.issues) ? (aiParsed.issues as string[]).filter((x) => typeof x === 'string') : [];

    const coverageIssues: string[] = [];
    if (coverage.primaryCoverage < 1) coverageIssues.push('missing_primary_keyword');
    if (coverage.secondaryCoverage < 0.6) coverageIssues.push('low_secondary_coverage');
    if (coverage.semanticCoverage < 0.5) coverageIssues.push('low_semantic_depth');

    const issues = [...new Set([...deterministic.issues, ...aiIssues, ...coverageIssues])];

    const result: AnalysisResult = {
      ...deterministic,
      keywordCoverageScore: Number(coverage.overallScore.toFixed(2)),
      semanticDepthScore: Number(coverage.semanticCoverage.toFixed(2)),
      experienceScore: pickScore(aiParsed.experienceScore, eeatDims.experienceScore),
      genericContentScore: pickScore(aiParsed.genericContentScore, eeatDims.genericContentScore),
      informationGainScore: pickScore(aiParsed.informationGainScore, eeatDims.informationGainScore),
      eeatSignalScore: pickScore(aiParsed.eeatSignalScore, eeatDims.eeatSignalScore),
      missingKeywords: coverage.missingKeywords,
      issues,
    };

    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        pipelineStatus: 'ANALYZING',
        seoScore: result.seoScore,
        readabilityScore: result.readabilityScore,
        intentMatch: result.intentMatch,
        contentDepth: result.contentDepth,
        redundancyScore: result.redundancyScore,
        contentGaps: [...result.gaps, ...coverage.missingSemanticTopics],
        pipelineCheckpoint: ({
          analysis: result,
          qualityThreshold: config.qualityThreshold,
        } as unknown) as Prisma.InputJsonValue,
        lastAnalyzedAt: new Date(),
      },
    });
    return result;
  }
}
