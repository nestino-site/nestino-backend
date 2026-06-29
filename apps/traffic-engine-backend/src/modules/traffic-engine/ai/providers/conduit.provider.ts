import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderClient,
} from './ai-provider.client';
import { openAiCompatibleComplete } from './openai-compatible.client';

/**
 * Conduit gateway provider — one key, every model.
 * OpenAI Chat Completions-compatible endpoint that routes to any major provider.
 *
 * Env vars:
 *   CONDUIT_API_KEY   — required (sk-cdt-...)
 *   CONDUIT_BASE_URL  — optional, default https://conduit.ozdoev.net/api/v1
 */
@Injectable()
export class ConduitProvider implements AiProviderClient {
  readonly provider = AiProvider.conduit;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const key = process.env.CONDUIT_API_KEY;
    if (!key) {
      throw new Error('CONDUIT_API_KEY is not configured');
    }
    const baseUrl = (
      process.env.CONDUIT_BASE_URL ?? 'https://conduit.ozdoev.net/api/v1'
    ).replace(/\/+$/, '');
    return openAiCompatibleComplete(request, baseUrl, key, 'Conduit');
  }
}
