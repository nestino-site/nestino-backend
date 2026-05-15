import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface OpenAiImageResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
}

@Injectable()
export class AiImageProvider {
  private readonly logger = new Logger(AiImageProvider.name);

  /**
   * Generate an image using OpenAI DALL-E 3 and return raw buffer.
   * Falls back to null on API error.
   */
  async generateImageBuffer(prompt: string): Promise<Buffer | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set — AI image generation unavailable');
      return null;
    }

    try {
      const res = await axios.post<OpenAiImageResponse>(
        'https://api.openai.com/v1/images/generations',
        {
          model: process.env.AI_IMAGE_GENERATION_MODEL ?? 'dall-e-3',
          prompt,
          n: 1,
          size: '1792x1024',
          response_format: 'b64_json',
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 90_000,
        },
      );

      const b64 = res.data.data?.[0]?.b64_json;
      if (!b64) {
        this.logger.warn({ msg: 'openai_image_empty_response', promptSnippet: prompt.slice(0, 80) });
        return null;
      }

      return Buffer.from(b64, 'base64');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'ai_image_generation_failed', error: message });
      return null;
    }
  }

  /**
   * Build a descriptive, photography-style prompt for AI image generation.
   */
  buildPrompt(subject: string, keywords: string[]): string {
    const keywordStr = keywords.slice(0, 4).join(', ');
    return (
      `Photorealistic editorial travel/lifestyle photograph of ${subject}. ` +
      `Themes: ${keywordStr}. ` +
      `High resolution, natural lighting, wide angle, professional composition. ` +
      `No text, no logos, no watermarks, no identifiable faces.`
    );
  }
}
