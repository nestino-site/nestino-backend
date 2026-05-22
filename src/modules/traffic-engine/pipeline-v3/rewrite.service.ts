import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiExecutionService } from '../ai/execution/ai-execution.service';
import { SiteConfigRecord } from '../config/config.types';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';
import { AnalysisResult } from './analysis.service';

@Injectable()
export class RewriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiExecution: AiExecutionService,
  ) {}

  async rewrite(
    pageId: number,
    siteId: number,
    draft: string,
    analysis: AnalysisResult,
    cluster: KeywordClusterData,
    priority: number,
    config: SiteConfigRecord,
  ): Promise<string> {
    const output = await this.aiExecution.execute({
      step: 'rewrite',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: {
        draftText: draft,
        analyzeJson: analysis,
        keyword: cluster.primaryKeyword,
        secondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
        semanticTopics: cluster.semanticTopics,
        missingKeywords: analysis.missingKeywords,
        qualityThreshold: config.qualityThreshold,
        rewriteInstructions: [
          'Rewrite pass: readability and flow ONLY. Do not add new facts, stats, addresses, or hotels. Do not strip experience signals (numbers, limitations, local anchors, guest-style lines).',
          `Reference scores (do not invent content to fix them): genericContent=${analysis.genericContentScore}, experience=${analysis.experienceScore}, informationGain=${analysis.informationGainScore}, eeatSignal=${analysis.eeatSignalScore}.`,
          `Primary keyword "${cluster.primaryKeyword}" MUST appear verbatim (case-insensitive) in the H1 heading.`,
          `Missing keywords (rephrase only if already implied; do not add claims): ${analysis.missingKeywords.join(', ') || '(none)'}`,
          'Output clean Markdown only (no HTML, no JSON, no escaped \\n sequences).',
        ].join('\n'),
      },
      maxOutputTokens: 2600,
    });

    const rewritten = cleanMarkdownOutput(output.text);
    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        rawDraft: rewritten,
        wordCount: rewritten.split(/\s+/).filter(Boolean).length,
        pipelineStatus: 'REWRITING',
      },
    });
    return rewritten;
  }

  async runAdversarialStressRewrite(
    pageId: number,
    siteId: number,
    draft: string,
    cluster: KeywordClusterData,
    priority: number,
    antiPatterns: string[],
  ): Promise<string> {
    const output = await this.aiExecution.execute({
      step: 'rewrite',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: {
        draftText: draft,
        keyword: cluster.primaryKeyword,
        secondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
        semanticTopics: cluster.semanticTopics,
        antiPatterns,
        rewriteInstructions: [
          'Adversarial quality pass: improve E-E-A-T clarity and remove detected anti-patterns.',
          `Detected anti-patterns: ${antiPatterns.join(', ')}`,
          'Keep intent, structure, and original factual claims. Do not invent numbers or citations.',
          'Remove filler intros and vague entities. Reduce keyword stuffing.',
          'Output clean Markdown only (no JSON, no escaped \\n).',
        ].join('\n'),
      },
      maxOutputTokens: 2200,
    });

    const rewritten = cleanMarkdownOutput(output.text);
    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        rawDraft: rewritten,
        wordCount: rewritten.split(/\s+/).filter(Boolean).length,
        pipelineStatus: 'REWRITING',
      },
    });
    return rewritten;
  }
}
