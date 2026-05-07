import { Injectable } from '@nestjs/common';
import { AiProvider, KeywordIntent } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { SiteConfigService } from '../../config/site-config.service';
import { AiOrchestratorService } from '../ai-orchestrator.service';
import { AiModelRouterService } from '../model-router/ai-model-router.service';
import { AiPipelineStepConfig } from '../types/ai-pipeline.types';
import { BudgetAction, PipelineStep, PromptCompositionContext } from '../types/ai-execution.types';
import { CostControllerService } from './cost-controller.service';
import { PromptCompositionEngineService } from '../prompt-engine/prompt-composition-engine.service';

export interface ExecuteStepInput {
  step: PipelineStep;
  siteId: string;
  pageId: string;
  priority: number;
  intent: KeywordIntent;
  runtimeContext: Record<string, unknown>;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

@Injectable()
export class AiExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteConfigService: SiteConfigService,
    private readonly modelRouter: AiModelRouterService,
    private readonly costController: CostControllerService,
    private readonly promptEngine: PromptCompositionEngineService,
    private readonly orchestrator: AiOrchestratorService,
  ) {}

  async execute(input: ExecuteStepInput) {
    const budgetAction = await this.costController.getDowngradeAction(input.siteId);
    if (budgetAction === 'skip_analysis' && input.step === 'analyze') {
      return {
        text: JSON.stringify({
          seoScore: 60,
          readabilityScore: 60,
          wordCount: String(input.runtimeContext.draftText ?? '').split(/\s+/).filter(Boolean).length,
          issues: ['analysis_skipped_by_budget'],
          experienceScore: 55,
          genericContentScore: 55,
          informationGainScore: 55,
          eeatSignalScore: 55,
        }),
        parsedJson: {
          seoScore: 60,
          readabilityScore: 60,
          wordCount: String(input.runtimeContext.draftText ?? '').split(/\s+/).filter(Boolean).length,
          issues: ['analysis_skipped_by_budget'],
          experienceScore: 55,
          genericContentScore: 55,
          informationGainScore: 55,
          eeatSignalScore: 55,
        },
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    const promptContext = await this.buildPromptContext(input);
    const builtPrompt = await this.promptEngine.compose(promptContext);
    const estimatedTokens = Math.ceil(
      `${builtPrompt.system ?? ''}${builtPrompt.user}`.length / 4,
    );
    if (budgetAction === 'reduce_tokens' && estimatedTokens > (input.maxOutputTokens ?? 1500)) {
      builtPrompt.user = builtPrompt.user.slice(0, 4000);
    }

    const model = await this.modelRouter.resolve({
      step: input.step,
      intent: input.intent,
      priority: input.priority,
      siteId: input.siteId,
      budgetAction,
    });

    const stepCfg: AiPipelineStepConfig = {
      stepKey: input.step,
      provider: this.resolveProviderFromModel(model),
      model,
      promptTemplateId: `${input.step}_${promptContext.version}`,
      timeoutMs: input.timeoutMs ?? 120_000,
      maxOutputTokens: input.maxOutputTokens ?? 1500,
    };

    const startedAt = Date.now();
    const output = await this.orchestrator.runStepWithPrompt(stepCfg, builtPrompt);
    const durationMs = Date.now() - startedAt;
    const cost = Number(((output.inputTokens + output.outputTokens) * 0.000001).toFixed(6));

    await this.costController.recordCost(input.siteId, output.inputTokens + output.outputTokens, cost);
    await this.prisma.aiGenerationLog.create({
      data: {
        pageId: input.pageId,
        pipelineVersion: 3,
        stepKey: input.step,
        provider: stepCfg.provider,
        model: stepCfg.model,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        cost,
        durationMs,
        promptHash: createHash('sha256').update(JSON.stringify(builtPrompt)).digest('hex'),
        status: 'SUCCESS',
      },
    });
    return output;
  }

  private async buildPromptContext(input: ExecuteStepInput): Promise<PromptCompositionContext> {
    const siteConfig = await this.siteConfigService.getForSite(input.siteId);
    const version =
      input.step === 'generate'
        ? siteConfig.promptConfig.generateVersion
        : input.step === 'analyze'
          ? siteConfig.promptConfig.analyzeVersion
          : input.step === 'rewrite'
            ? siteConfig.promptConfig.rewriteVersion
            : input.step === 'image_generation'
              ? siteConfig.promptConfig.imageGenerationVersion
              : siteConfig.promptConfig.seoCheckVersion;
    const abVariant = await this.promptEngine.resolveVariant(input.siteId, input.pageId);
    const pc = siteConfig.promptConfig;
    return {
      type: input.step,
      siteId: input.siteId,
      version,
      tone: pc.tone,
      locale: pc.locale ?? 'en',
      humanizationEnabled: pc.humanization.enabled,
      humanizationLevel: pc.humanization.level,
      runtimeContext: input.runtimeContext,
      abVariant,
    };
  }

  private resolveProviderFromModel(model: string): AiProvider {
    const lowered = model.toLowerCase();
    if (lowered.includes('claude')) {
      return AiProvider.anthropic;
    }
    if (lowered.includes('gemini')) {
      return AiProvider.google;
    }
    return AiProvider.openai;
  }
}
