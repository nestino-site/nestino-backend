import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderClient,
} from './ai-provider.client';

@Injectable()
export class GoogleGeminiProvider implements AiProviderClient {
  readonly provider = AiProvider.google;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_AI_API_KEY is not configured');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    const parts = [
      ...(request.prompt.system
        ? [{ text: `${request.prompt.system}\n\n${request.prompt.user}` }]
        : [{ text: request.prompt.user }]),
    ];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: request.temperature ?? 0.3,
            maxOutputTokens: request.maxOutputTokens ?? 2048,
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return {
        text,
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
