import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SeoBriefBuilder } from '../brief/seo-brief.builder';
import { SiteConfigRecord } from '../config/config.types';
import { KnowledgeBaseService } from '../intelligence/knowledge-base.service';
import { AiExecutionService } from '../ai/execution/ai-execution.service';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';

export interface GenerationResult {
  outline: Record<string, unknown>;
  draft: string;
  wordCount: number;
}

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiExecution: AiExecutionService,
    private readonly briefBuilder: SeoBriefBuilder,
    private readonly knowledgeBase: KnowledgeBaseService,
  ) {}

  async generate(
    pageId: number,
    siteId: number,
    _config: SiteConfigRecord,
    runtimeContext: Record<string, unknown>,
    cluster: KeywordClusterData,
    priority: number,
  ): Promise<GenerationResult> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true, keyword: true },
    });
    if (!page?.keyword) {
      throw new Error('Page or keyword missing for generation');
    }

    const subject = await this.prisma.subject.findFirst({
      where: {
        siteId,
        OR: [
          { primaryKeywords: { has: page.keyword.keyword } },
          { secondaryKeywords: { has: page.keyword.keyword } },
        ],
      },
      include: { template: true },
    });

    const brief = await this.briefBuilder.build(page.site, page.keyword, page, {
      clusterSecondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
      template: subject?.template ?? null,
      pillarPageId: subject?.pillarPageId ?? null,
    });

    const clusterContext = this.buildClusterContext(cluster);
    let mergedRuntime = this.knowledgeBase.mergeIntoRuntime(page.site, {
      ...runtimeContext,
      ...clusterContext,
      seoBrief: brief,
      targetWordCount: brief.targetWordCount,
      requiredSections: brief.requiredSections,
      paaQuestions: brief.paaQuestions,
      internalLinkTargets: brief.internalLinkTargets,
    });

    const outlineOutput = await this.aiExecution.execute({
      step: 'generate',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: { ...mergedRuntime, mode: 'outline' },
      maxOutputTokens: 900,
    });

    let outline: Record<string, unknown>;
    try {
      outline = JSON.parse(outlineOutput.text) as Record<string, unknown>;
    } catch {
      outline = { h2s: [], raw: outlineOutput.text };
    }

    mergedRuntime = {
      ...mergedRuntime,
      mode: 'draft',
      briefJson: outline,
    };

    const draftOutput = await this.aiExecution.execute({
      step: 'generate',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: mergedRuntime,
      maxOutputTokens: 2600,
    });

    const draft = cleanMarkdownOutput(draftOutput.text);
    const wordCount = draft.split(/\s+/).filter(Boolean).length;

    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        outline: outline as Prisma.InputJsonValue,
        rawDraft: draft,
        wordCount,
        pipelineStatus: 'GENERATING',
        pipelineVersion: 3,
      },
    });

    return { outline, draft, wordCount };
  }

  private buildClusterContext(cluster: KeywordClusterData): Record<string, unknown> {
    return {
      keyword: cluster.primaryKeyword,
      topic: cluster.topic,
      intent: cluster.intent,
      semanticTopics: cluster.semanticTopics,
      secondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
    };
  }
}
