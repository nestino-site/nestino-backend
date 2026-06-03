import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import { AiProviderClient } from './providers/ai-provider.client';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleGeminiProvider } from './providers/google-gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Injectable()
export class AiProviderRegistry {
  constructor(
    private readonly openai: OpenAiProvider,
    private readonly anthropic: AnthropicProvider,
    private readonly google: GoogleGeminiProvider,
  ) {}

  get(provider: AiProvider): AiProviderClient {
    switch (provider) {
      case AiProvider.openai:
        return this.openai;
      case AiProvider.anthropic:
        return this.anthropic;
      case AiProvider.google:
        return this.google;
      default:
        throw new Error(`Unsupported provider: ${String(provider)}`);
    }
  }
}
