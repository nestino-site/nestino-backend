import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiGatewayConfig } from './config/ai-gateway.config';
import { BuiltPrompt, PromptBuildInput, PromptTemplateRegistry } from './prompt-template.registry';
import {
  AiCompletionRequest,
} from './providers/ai-provider.client';
import {
  AiPipelineStepConfig,
  FailureClassification,
  NormalizedAiOutput,
} from './types/ai-pipeline.types';

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly registry: AiProviderRegistry,
    private readonly templates: PromptTemplateRegistry,
    private readonly gatewayConfig: AiGatewayConfig,
  ) {}

  handleFailure(error: unknown): FailureClassification {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('HTTP 429') ||
      message.includes('HTTP 5') ||
      message.includes('abort') ||
      message.includes('ECONNRESET')
    ) {
      return 'TRANSIENT';
    }
    if (message.includes('not configured') || message.includes('HTTP 401') || message.includes('HTTP 403')) {
      return 'PERMANENT';
    }
    return 'TRANSIENT';
  }

  fallbackProvider(step: AiPipelineStepConfig): AiPipelineStepConfig | null {
    const next = this.gatewayConfig.nextFallback(step.provider);
    if (!next) return null;
    return {
      ...step,
      provider: next.provider,
      model: next.model,
      promptTemplateId: step.promptTemplateId,
    };
  }

  async runStep(
    step: AiPipelineStepConfig,
    promptInput: PromptBuildInput,
  ): Promise<NormalizedAiOutput> {
    const built = this.templates.build(step.promptTemplateId, promptInput);
    return this.runWithBuiltPrompt(step, built);
  }

  async runStepWithPrompt(step: AiPipelineStepConfig, built: BuiltPrompt): Promise<NormalizedAiOutput> {
    return this.runWithBuiltPrompt(step, built);
  }

  async runPipeline(
    steps: AiPipelineStepConfig[],
    runner: (step: AiPipelineStepConfig) => Promise<NormalizedAiOutput>,
  ): Promise<NormalizedAiOutput[]> {
    const outputs: NormalizedAiOutput[] = [];
    for (const step of steps) {
      outputs.push(await runner(step));
    }
    return outputs;
  }

  hashPrompt(templateId: string, built: { system?: string; user: string }): string {
    const canonical = JSON.stringify({
      templateId,
      system: built.system ?? '',
      user: built.user,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private stubOutput(
    stepKey: string,
    built: { system?: string; user: string },
    promptHash: string,
  ): NormalizedAiOutput {
    void promptHash;
    if (stepKey === 'outline') {
      return {
        text: JSON.stringify({
          title: 'Stub title',
          h2s: ['Section A', 'Section B'],
          faq: [{ q: 'Q1', a: 'A1' }],
        }),
        parsedJson: { title: 'Stub title', h2s: ['Section A'], faq: [] },
        inputTokens: 10,
        outputTokens: 50,
      };
    }
    if (stepKey === 'analyze') {
      return {
        text: JSON.stringify({
          seoScore: 65,
          readabilityScore: 70,
          wordCount: 400,
          issues: ['weak_intro'],
        }),
        parsedJson: { seoScore: 65, readabilityScore: 70, wordCount: 400, issues: ['weak_intro'] },
        inputTokens: 20,
        outputTokens: 40,
      };
    }
    return {
      text: `Stub content for ${stepKey}. Prompt len=${built.user.length}`,
      inputTokens: 5,
      outputTokens: 20,
    };
  }

  private async runWithBuiltPrompt(
    step: AiPipelineStepConfig,
    built: BuiltPrompt,
  ): Promise<NormalizedAiOutput> {
    const promptHash = this.hashPrompt(step.promptTemplateId, built);
    const timeoutMs = step.timeoutMs ?? 120_000;
    if (process.env.AI_STUB === 'true') {
      return this.stubOutput(step.stepKey, built, promptHash);
    }

    let active: AiPipelineStepConfig = step;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const client = this.registry.get(active.provider);
        const req: AiCompletionRequest = {
          provider: active.provider,
          model: active.model,
          prompt: built,
          temperature: active.temperature,
          maxOutputTokens: active.maxOutputTokens,
          timeoutMs,
          responseFormat: active.responseFormat,
        };
        const res = await client.complete(req);
        let parsedJson: Record<string, unknown> | undefined;
        try {
          parsedJson = JSON.parse(res.text) as Record<string, unknown>;
        } catch {
          parsedJson = undefined;
        }
        return {
          text: res.text,
          parsedJson,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
        };
      } catch (error) {
        lastError = error;
        const kind = this.handleFailure(error);
        this.logger.warn({
          msg: 'ai_step_failed',
          stepKey: step.stepKey,
          provider: active.provider,
          attempt,
          failureType: kind,
        });
        if (kind === 'PERMANENT') {
          throw error instanceof Error ? error : new Error(String(error));
        }
        const fb = this.fallbackProvider(active);
        if (!fb) {
          throw error instanceof Error ? error : new Error(String(error));
        }
        active = fb;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
