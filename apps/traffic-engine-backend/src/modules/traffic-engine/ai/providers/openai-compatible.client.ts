import { AiCompletionRequest, AiCompletionResponse } from './ai-provider.client';

/**
 * Shared fetch helper for any OpenAI Chat Completions-compatible endpoint.
 * Used by OpenAiProvider (api.openai.com) and ConduitProvider (conduit.ozdoev.net).
 *
 * Error messages intentionally preserve the "HTTP <status>:" prefix so that
 * AiOrchestratorService.handleFailure and ErrorClassifierService keep working
 * without changes.
 */
export async function openAiCompatibleComplete(
  request: AiCompletionRequest,
  baseUrl: string,
  apiKey: string,
  label: string,
): Promise<AiCompletionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
        ...(request.responseFormat === 'json'
          ? { response_format: { type: 'json_object' } }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${label} HTTP ${res.status}: ${errText.slice(0, 200)}`);
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
