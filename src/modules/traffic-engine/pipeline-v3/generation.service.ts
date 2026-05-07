import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
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
  ) {}

  async generate(
    pageId: string,
    siteId: string,
    _config: unknown,
    runtimeContext: Record<string, unknown>,
    cluster: KeywordClusterData,
    priority: number,
  ): Promise<GenerationResult> {
    const clusterContext = this.buildClusterContext(cluster);

    const outlineOutput = await this.aiExecution.execute({
      step: 'generate',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: { ...runtimeContext, ...clusterContext, mode: 'outline' },
      maxOutputTokens: 900,
    });

    let outline: Record<string, unknown>;
    try {
      outline = JSON.parse(outlineOutput.text) as Record<string, unknown>;
    } catch {
      outline = { h2s: [], raw: outlineOutput.text };
    }

    const draftOutput = await this.aiExecution.execute({
      step: 'generate',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: {
        ...runtimeContext,
        ...clusterContext,
        mode: 'draft',
        briefJson: outline,
      },
      maxOutputTokens: 2600,
    });
    // cleanMarkdownOutput applies normalizeContentOutput (escaped \n, \") then markdown tidy
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
      language: cluster.language,
      intent: cluster.intent,
      topic: cluster.topic,
      secondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
      semanticTopics: cluster.semanticTopics,
      clusterInstructions: [
        `Primary keyword to prioritize: "${cluster.primaryKeyword}"`,
        `Include these secondary keywords naturally (60-80% coverage): ${cluster.secondaryKeywords.map((k) => k.keyword).join(', ')}`,
        `Use these as H2/H3 section topics: ${cluster.semanticTopics.slice(0, 4).join(', ')}`,
        'Avoid keyword stuffing. Write naturally for humans first.',
        'Return ONLY valid markdown.',
        'Do NOT use escaped newlines like \\n.',
        'Do NOT return JSON or HTML.',
      ].join('\n'),
    };
  }
}
