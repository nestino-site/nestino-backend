import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { LlmClient, LlmJsonRequest } from './llm-client.interface';

interface OpenModelMessageBlock {
  type: string;
  text?: string;
  thinking?: string;
}

interface OpenModelMessagesResponse {
  content?: OpenModelMessageBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: string };
}

/**
 * OpenModel provider for DeepSeek models via the Anthropic Messages API.
 * deepseek-v4-flash is NOT available on /v1/chat/completions — OpenModel routes
 * it through POST /v1/messages instead.
 *
 * Required env vars:
 *   OPENMODEL_API_KEY     — secret key for OpenModel
 *   OPENMODEL_BASE_URL    — e.g. https://api.openmodel.ai/v1
 *   OPENMODEL_MODEL       — e.g. deepseek-v4-flash
 *   OPENMODEL_TIMEOUT_MS  — optional, defaults to 90 000 ms
 */
@Injectable()
export class OpenModelClient implements LlmClient {
  private readonly logger = new Logger(OpenModelClient.name);
  private readonly apiKey: string;
  private readonly messagesUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor() {
    const apiKey = process.env.OPENMODEL_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'OPENMODEL_API_KEY is not configured. Set it in your .env file before using clinic enrichment.',
      );
    }

    const baseURL = (process.env.OPENMODEL_BASE_URL ?? 'https://api.openmodel.ai/v1').replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.messagesUrl = baseURL.endsWith('/v1') ? `${baseURL}/messages` : `${baseURL}/v1/messages`;
    this.model = process.env.OPENMODEL_MODEL ?? 'deepseek-v4-flash';
    this.timeoutMs = Number(process.env.OPENMODEL_TIMEOUT_MS ?? 90_000);
  }

  async completeJson(request: LlmJsonRequest): Promise<string> {
    this.logger.debug({ msg: 'openmodel_request', model: this.model, url: this.messagesUrl });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.messagesUrl, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 6000,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
        }),
        signal: controller.signal,
      });

      const data = (await res.json()) as OpenModelMessagesResponse;

      if (!res.ok) {
        const errMsg = data.error?.message ?? JSON.stringify(data).slice(0, 300);
        throw new Error(`${res.status} ${errMsg}`);
      }

      const text = (data.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text!)
        .join('')
        .trim();

      if (!text) {
        throw new Error('OpenModel returned an empty text response');
      }

      this.logger.debug({
        msg: 'openmodel_response',
        model: this.model,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      });

      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}
