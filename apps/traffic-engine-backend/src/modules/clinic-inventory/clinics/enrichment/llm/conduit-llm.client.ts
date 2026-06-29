import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LlmClient, LlmJsonRequest } from './llm-client.interface';

/**
 * Conduit LLM client for JSON-only actions (internal linking, clinic enrichment).
 * Uses the OpenAI Chat Completions-compatible endpoint with response_format: json_object.
 *
 * Env vars:
 *   CONDUIT_API_KEY   — required (sk-cdt-...)
 *   CONDUIT_BASE_URL  — optional, default https://conduit.ozdoev.net/api/v1
 *   CONDUIT_LLM_MODEL — optional, default gpt-4o-mini
 *   CONDUIT_LLM_TIMEOUT_MS — optional, default 90000
 */
@Injectable()
export class ConduitLlmClient implements LlmClient {
  private readonly logger = new Logger(ConduitLlmClient.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private warnedMissingKey = false;

  constructor() {
    this.baseUrl = (
      process.env.CONDUIT_BASE_URL ?? 'https://conduit.ozdoev.net/api/v1'
    ).replace(/\/+$/, '');
    this.model = process.env.CONDUIT_LLM_MODEL ?? 'gpt-4o-mini';
    this.timeoutMs = Number(process.env.CONDUIT_LLM_TIMEOUT_MS ?? 90_000);

    if (!process.env.CONDUIT_API_KEY?.trim()) {
      this.logger.warn(
        'CONDUIT_API_KEY is not set — LLM actions (internal linking, enrichment) will return 503 until configured.',
      );
    }
  }

  private requireApiKey(): string {
    const key = process.env.CONDUIT_API_KEY?.trim();
    if (!key) {
      if (!this.warnedMissingKey) {
        this.warnedMissingKey = true;
        this.logger.error('CONDUIT_API_KEY is missing — LLM request rejected.');
      }
      throw new ServiceUnavailableException(
        'CONDUIT_API_KEY is not configured. Add it to your environment variables.',
      );
    }
    return key;
  }

  async completeJson(request: LlmJsonRequest): Promise<string> {
    const apiKey = this.requireApiKey();

    this.logger.debug({ msg: 'conduit_llm_request', model: this.model, url: `${this.baseUrl}/chat/completions` });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };

      if (!res.ok) {
        const errMsg = data.error?.message ?? JSON.stringify(data).slice(0, 300);
        throw new Error(`Conduit HTTP ${res.status}: ${errMsg}`);
      }

      const text = data.choices?.[0]?.message?.content?.trim() ?? '';

      if (!text) {
        throw new Error('Conduit returned an empty response');
      }

      this.logger.debug({
        msg: 'conduit_llm_response',
        model: this.model,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      });

      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}
