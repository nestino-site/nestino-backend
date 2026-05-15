import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderClient,
} from './ai-provider.client';

@Injectable()
export class OpenAiProvider implements AiProviderClient {
  readonly provider = AiProvider.openai;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            ...(request.prompt.system
              ? [{ role: 'system', content: request.prompt.system }]
              : []),
            { role: 'user', content: request.prompt.user },
          ],
          temperature: request.temperature ?? 0.3,
          max_tokens: request.maxOutputTokens,
          // Activate JSON mode for structured steps (outline, analyze, seo_check)
          ...(request.responseFormat === 'json'
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      return {
        text,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
