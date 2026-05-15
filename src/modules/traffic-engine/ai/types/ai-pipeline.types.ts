import { AiProvider } from '@prisma/client';

export interface AiPipelineStepConfig {
  stepKey: string;
  provider: AiProvider;
  model: string;
  promptTemplateId: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Force JSON structured output for this step. */
  responseFormat?: 'json' | 'text';
}

export interface AiPipelineConfig {
  version: number;
  steps: AiPipelineStepConfig[];
}

export interface NormalizedAiOutput {
  text: string;
  parsedJson?: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
}

export type FailureClassification = 'TRANSIENT' | 'PERMANENT';
