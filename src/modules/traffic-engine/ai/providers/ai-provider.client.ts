import { AiProvider } from '@prisma/client';
import { BuiltPrompt } from '../prompt-template.registry';

export interface AiCompletionRequest {
  provider: AiProvider;
  model: string;
  prompt: BuiltPrompt;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs: number;
}

export interface AiCompletionResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProviderClient {
  readonly provider: AiProvider;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
