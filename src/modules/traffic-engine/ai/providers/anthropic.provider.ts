import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderClient,
} from './ai-provider.client';

@Injectable()
export class AnthropicProvider implements AiProviderClient {
  readonly provider = AiProvider.anthropic;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens ?? 4096,
          temperature: request.temperature ?? 0.3,
          system: request.prompt.system,
          messages: [{ role: 'user', content: request.prompt.user }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text =
        data.content?.map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('') ?? '';
      return {
        text,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
