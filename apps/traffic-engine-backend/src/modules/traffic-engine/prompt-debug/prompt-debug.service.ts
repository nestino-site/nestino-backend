import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PromptCompositionEngineService } from '../ai/prompt-engine/prompt-composition-engine.service';
import { AiModelRouterService } from '../ai/model-router/ai-model-router.service';
import { PipelineStep, PromptCompositionContext } from '../ai/types/ai-execution.types';
import { CostControllerService } from '../ai/execution/cost-controller.service';
import { SiteConfigRecord } from '../config/config.types';
import { SiteConfigService } from '../config/site-config.service';
import { ClusterBuilderService } from '../intelligence/keyword-intelligence/cluster-builder.service';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';

export interface PromptPreviewResult {
  system: string;
  user: string;
  model: string;
  tokensEstimate: number;
}

@Injectable()
export class PromptDebugService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteConfigService: SiteConfigService,
    private readonly clusterBuilder: ClusterBuilderService,
    private readonly promptEngine: PromptCompositionEngineService,
    private readonly modelRouter: AiModelRouterService,
    private readonly costController: CostControllerService,
  ) {}

  async previewPrompt(
    pageId: number,
    step: PipelineStep,
    generateMode: 'outline' | 'draft',
  ): Promise<PromptPreviewResult> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true, keyword: true },
    });
    if (!page?.keyword) {
      throw new NotFoundException(`Page ${pageId} or its keyword not found`);
    }

    const siteConfig = await this.siteConfigService.getForSite(page.siteId);
    const cluster = await this.clusterBuilder.buildCluster(page.keyword.id, page.siteId);
    const clusterCtx = this.buildClusterRuntime(cluster);
    const priority = page.keyword.priority;
    const budgetAction = await this.costController.getDowngradeAction(page.siteId);
    const model = await this.modelRouter.resolve({
      step,
      intent: cluster.intent,
      priority,
      siteId: page.siteId,
      budgetAction,
    });

    const runtimeContext = this.buildRuntimeContext(
      page,
      step,
      generateMode,
      cluster,
      clusterCtx,
      siteConfig,
    );

    const promptContext = await this.buildCompositionContext(
      pageId,
      page.siteId,
      step,
      siteConfig,
      runtimeContext,
    );

    const built = await this.promptEngine.compose(promptContext, { skipCache: true });
    const tokensEstimate = Math.ceil(`${built.system ?? ''}${built.user}`.length / 4);

    return {
      system: built.system ?? '',
      user: built.user,
      model,
      tokensEstimate,
    };
  }

  private buildClusterRuntime(cluster: KeywordClusterData): Record<string, unknown> {
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

  private buildRuntimeContext(
    page: {
      site: { name: string; domain: string };
      outline: unknown;
      rawDraft: string | null;
      title: string | null;
      pipelineCheckpoint: unknown;
    },
    step: PipelineStep,
    generateMode: 'outline' | 'draft',
    cluster: KeywordClusterData,
    clusterCtx: Record<string, unknown>,
    siteConfig: SiteConfigRecord,
  ): Record<string, unknown> {
    const base = {
      siteName: page.site.name,
      domain: page.site.domain,
      ...clusterCtx,
    };

    if (step === 'generate') {
      if (generateMode === 'outline') {
        return { ...base, mode: 'outline' };
      }
      const outline =
        (page.outline as Record<string, unknown> | null) ??
        ({ h2s: [], title: page.title ?? '' } as Record<string, unknown>);
      return { ...base, mode: 'draft', briefJson: outline };
    }

    if (step === 'analyze') {
      return {
        draftText: page.rawDraft ?? '',
        briefJson: (page.outline as Record<string, unknown>) ?? {},
        keyword: cluster.primaryKeyword,
        secondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
        semanticTopics: cluster.semanticTopics,
      };
    }

    const cp = page.pipelineCheckpoint as { analysis?: Record<string, unknown> } | null;
    const analysis =
      cp?.analysis ??
      ({
        issues: ['preview_placeholder:no_pipeline_analysis_in_checkpoint'],
        missingKeywords: [] as string[],
        gaps: [] as string[],
        experienceScore: 55,
        genericContentScore: 55,
        informationGainScore: 55,
        eeatSignalScore: 55,
      } as Record<string, unknown>);

    return {
      draftText: page.rawDraft ?? '',
      analyzeJson: analysis,
      keyword: cluster.primaryKeyword,
      secondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
      semanticTopics: cluster.semanticTopics,
      missingKeywords: (analysis.missingKeywords as string[] | undefined) ?? [],
      qualityThreshold: siteConfig.qualityThreshold,
      rewriteInstructions: [
        'Rewrite pass: readability and flow ONLY. Do not add new facts. Do not strip experience signals.',
        `Keyword "${cluster.primaryKeyword}" — natural placement only; no stuffing.`,
        `Missing keywords (rephrase if implied only): ${((analysis.missingKeywords as string[]) ?? []).join(', ') || '(none)'}`,
        'Output clean Markdown only (no HTML, JSON, or escaped newline sequences).',
      ].join('\n'),
    };
  }

  private async buildCompositionContext(
    pageId: number,
    siteId: number,
    step: PipelineStep,
    siteConfig: SiteConfigRecord,
    runtimeContext: Record<string, unknown>,
  ): Promise<PromptCompositionContext> {
    const version =
      step === 'generate'
        ? siteConfig.promptConfig.generateVersion
        : step === 'analyze'
          ? siteConfig.promptConfig.analyzeVersion
          : siteConfig.promptConfig.rewriteVersion;
    const abVariant = await this.promptEngine.resolveVariant(siteId, pageId);
    const pc = siteConfig.promptConfig;
    return {
      type: step,
      siteId,
      version,
      tone: pc.tone,
      locale: pc.locale ?? 'en',
      humanizationEnabled: pc.humanization.enabled,
      humanizationLevel: pc.humanization.level,
      runtimeContext,
      abVariant,
    };
  }
}
