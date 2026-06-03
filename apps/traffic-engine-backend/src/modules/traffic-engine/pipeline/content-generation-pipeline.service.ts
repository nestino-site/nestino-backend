import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  AiGenerationStatus,
  AiProvider,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { createHash } from 'node:crypto';

import {
  MAX_OPTIMIZATION_LOOPS,
  SEO_SCORE_OPTIMIZE_THRESHOLD,
} from '../../../common/constants/seo';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { PromptBuildInput } from '../ai/prompt-template.registry';
import { AiPipelineConfig, AiPipelineStepConfig } from '../ai/types/ai-pipeline.types';
import { SeoBriefBuilder } from '../brief/seo-brief.builder';

@Injectable()
export class ContentGenerationPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly briefBuilder: SeoBriefBuilder,
    private readonly orchestrator: AiOrchestratorService,
  ) {}

  parsePipeline(raw: Prisma.JsonValue | null): AiPipelineConfig {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new UnprocessableEntityException('Site aiPipeline is not configured');
    }
    const obj = raw as Record<string, unknown>;
    const version = obj.version;
    const steps = obj.steps;
    if (typeof version !== 'number' || version < 1 || !Array.isArray(steps) || steps.length < 3) {
      throw new UnprocessableEntityException('Invalid aiPipeline: need version and >= 3 steps');
    }
    const parsed: AiPipelineStepConfig[] = [];
    const keys = new Set<string>();
    for (const s of steps) {
      if (!s || typeof s !== 'object') {
        throw new UnprocessableEntityException('Invalid pipeline step');
      }
      const step = s as Record<string, unknown>;
      const stepKey = String(step.stepKey ?? '');
      const provider = step.provider as AiProvider;
      const model = String(step.model ?? '');
      const promptTemplateId = String(step.promptTemplateId ?? '');
      if (!stepKey || !model || !promptTemplateId) {
        throw new UnprocessableEntityException('Invalid pipeline step fields');
      }
      const allowedProviders: string[] = ['openai', 'anthropic', 'google'];
      if (!allowedProviders.includes(String(provider))) {
        throw new UnprocessableEntityException('Invalid provider');
      }
      if (keys.has(stepKey)) {
        throw new UnprocessableEntityException('Duplicate stepKey in aiPipeline');
      }
      keys.add(stepKey);
      parsed.push({
        stepKey,
        provider: provider as AiProvider,
        model,
        promptTemplateId,
        temperature: typeof step.temperature === 'number' ? step.temperature : undefined,
        maxOutputTokens: typeof step.maxOutputTokens === 'number' ? step.maxOutputTokens : undefined,
        timeoutMs: typeof step.timeoutMs === 'number' ? step.timeoutMs : undefined,
      });
    }
    return { version, steps: parsed };
  }

  async runForPage(pageId: number, contentTaskId?: number): Promise<void> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true, keyword: true },
    });
    if (!page || !page.keyword) {
      throw new UnprocessableEntityException('Page or keyword missing');
    }
    const cfg = this.parsePipeline(page.site.aiPipeline as Prisma.JsonValue);
    const must = ['outline', 'draft', 'analyze', 'optimize'];
    for (const key of must) {
      if (!cfg.steps.some((s) => s.stepKey === key)) {
        throw new UnprocessableEntityException(`aiPipeline must include stepKey "${key}"`);
      }
    }

    const brief = await this.briefBuilder.build(page.site, page.keyword, page);
    const briefInputBase: Omit<PromptBuildInput, 'briefJson' | 'draftText' | 'analyzeJson'> = {
      stepKey: '',
      siteName: brief.siteName,
      domain: brief.domain,
      keyword: brief.keyword,
      language: brief.language,
    };

    const getStep = (k: string): AiPipelineStepConfig => {
      const s = cfg.steps.find((x) => x.stepKey === k);
      if (!s) {
        throw new UnprocessableEntityException(`Missing step ${k}`);
      }
      return s;
    };

    const log = async (
      stepKey: string,
      provider: AiProvider,
      model: string,
      inputTokens: number,
      outputTokens: number,
      durationMs: number,
      promptHash: string,
      status: AiGenerationStatus,
    ): Promise<void> => {
      const cost = new Decimal(0.000001).mul(inputTokens + outputTokens);
      await this.prisma.aiGenerationLog.create({
        data: {
          pageId,
          pipelineVersion: cfg.version,
          stepKey,
          provider,
          model,
          inputTokens,
          outputTokens,
          cost,
          durationMs,
          promptHash,
          status,
        },
      });
    };

    const runLogged = async (
      stepCfg: AiPipelineStepConfig,
      input: PromptBuildInput,
    ) => {
      const promptHash = createHash('sha256')
        .update(
          JSON.stringify({
            templateId: stepCfg.promptTemplateId,
            stepKey: stepCfg.stepKey,
            keyword: input.keyword,
            language: input.language,
          }),
        )
        .digest('hex');
      const started = Date.now();
      try {
        const out = await this.orchestrator.runStep(stepCfg, { ...input, stepKey: stepCfg.stepKey });
        await log(
          stepCfg.stepKey,
          stepCfg.provider,
          stepCfg.model,
          out.inputTokens,
          out.outputTokens,
          Date.now() - started,
          promptHash,
          AiGenerationStatus.SUCCESS,
        );
        return out;
      } catch (e) {
        await log(
          stepCfg.stepKey,
          stepCfg.provider,
          stepCfg.model,
          0,
          0,
          Date.now() - started,
          promptHash,
          AiGenerationStatus.FAILED,
        );
        throw e;
      }
    };

    const outlineOut = await runLogged(getStep('outline'), { ...briefInputBase, stepKey: 'outline' });
    let outlineJson: Record<string, unknown>;
    try {
      outlineJson = JSON.parse(outlineOut.text) as Record<string, unknown>;
    } catch {
      outlineJson = { raw: outlineOut.text };
    }
    await this.prisma.page.update({
      where: { id: pageId },
      data: { outline: outlineJson as Prisma.InputJsonValue },
    });

    const draftOut = await runLogged(getStep('draft'), {
      ...briefInputBase,
      stepKey: 'draft',
      briefJson: outlineJson,
    });
    let currentDraft = draftOut.text;
    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        rawDraft: currentDraft,
        wordCount: currentDraft.split(/\s+/).filter(Boolean).length,
      },
    });

    const analyzeStep = getStep('analyze');
    const optimizeStep = getStep('optimize');

    let optimizationCount = page.optimizationCount;

    const runAnalyze = async (): Promise<{ seoScore: number; analyzeJson: Record<string, unknown>; text: string }> => {
      const out = await runLogged(analyzeStep, {
        ...briefInputBase,
        stepKey: 'analyze',
        briefJson: outlineJson,
        draftText: currentDraft,
      });
      let seoScore = 0;
      let readabilityScore = 0;
      let wc = currentDraft.split(/\s+/).filter(Boolean).length;
      let analyzeJson: Record<string, unknown> = { issues: [] };
      try {
        analyzeJson = JSON.parse(out.text) as Record<string, unknown>;
        if (typeof analyzeJson.seoScore === 'number') seoScore = analyzeJson.seoScore;
        if (typeof analyzeJson.readabilityScore === 'number') {
          readabilityScore = analyzeJson.readabilityScore as number;
        }
        if (typeof analyzeJson.wordCount === 'number') wc = analyzeJson.wordCount as number;
      } catch {
        seoScore = 60;
        readabilityScore = 60;
      }
      await this.prisma.page.update({
        where: { id: pageId },
        data: {
          seoScore,
          readabilityScore,
          wordCount: wc,
          lastAnalyzedAt: new Date(),
        },
      });
      return { seoScore, analyzeJson, text: out.text };
    };

    let { seoScore, analyzeJson } = await runAnalyze();

    let loops = 0;
    while (
      seoScore < SEO_SCORE_OPTIMIZE_THRESHOLD &&
      optimizationCount < MAX_OPTIMIZATION_LOOPS &&
      loops < MAX_OPTIMIZATION_LOOPS
    ) {
      const optOut = await runLogged(optimizeStep, {
        ...briefInputBase,
        stepKey: 'optimize',
        briefJson: outlineJson,
        draftText: currentDraft,
        analyzeJson,
      });
      currentDraft = optOut.text;
      optimizationCount += 1;
      await this.prisma.page.update({
        where: { id: pageId },
        data: {
          rawDraft: currentDraft,
          optimizationCount,
          wordCount: currentDraft.split(/\s+/).filter(Boolean).length,
        },
      });
      const next = await runAnalyze();
      seoScore = next.seoScore;
      analyzeJson = next.analyzeJson;
      loops += 1;
    }

    await this.prisma.page.update({
      where: { id: pageId },
      data: { finalContent: currentDraft },
    });

    if (contentTaskId) {
      await this.prisma.contentTask.update({
        where: { id: contentTaskId },
        data: {
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
          currentStep: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
    }
  }
}
