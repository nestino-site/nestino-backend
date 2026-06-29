import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderClient,
} from './ai-provider.client';
import { openAiCompatibleComplete } from './openai-compatible.client';

@Injectable()
export class OpenAiProvider implements AiProviderClient {
  readonly provider = AiProvider.openai;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    return openAiCompatibleComplete(request, 'https://api.openai.com/v1', key, 'OpenAI');
  }
}
