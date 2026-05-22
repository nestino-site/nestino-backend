import { Injectable, Logger } from '@nestjs/common';
import { KeywordIntent } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

interface ImagenPredictResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
  }>;
}

const DEFAULT_IMAGEN_MODEL = 'imagen-4.0-generate-001';

@Injectable()
export class ImageGenerationService {
  private readonly logger = new Logger(ImageGenerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generate(
    pageId: number,
    siteId: number,
    finalContent: string,
    keyword: string,
    priority: number,
    intent: KeywordIntent,
  ): Promise<{ imagePrompt: string; generatedImageBase64: string | null }> {
    void siteId;
    void priority;
    void intent;

    const imagePrompt = this.buildImagenPrompt(keyword, finalContent);
    const generatedImageBase64 = await this.generateWithImagen(imagePrompt);

    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        imagePrompt,
        generatedImageBase64,
      },
    });

    return { imagePrompt, generatedImageBase64 };
  }

  /**
   * Build the Imagen prompt locally — no OpenAI/Anthropic LLM hop.
   * Imagen receives the prompt directly via Google Generative Language API.
   */
  private buildImagenPrompt(keyword: string, finalContent: string): string {
    const context = finalContent.replace(/\s+/g, ' ').trim().slice(0, 1500);
    return (
      `Photorealistic editorial hero image for "${keyword}". ` +
      `Professional quality, natural lighting, wide composition, no text overlay, no logos, no watermarks. ` +
      `Article context: ${context}`
    );
  }

  private imagenModel(): string {
    return process.env.IMAGEN_MODEL?.trim() || DEFAULT_IMAGEN_MODEL;
  }

  private imagenParameters(): Record<string, unknown> {
    const params: Record<string, unknown> = {
      sampleCount: 1,
      aspectRatio: process.env.IMAGEN_ASPECT_RATIO?.trim() || '16:9',
    };
    const imageSize = process.env.IMAGEN_IMAGE_SIZE?.trim();
    if (imageSize) {
      params.imageSize = imageSize;
    }
    return params;
  }

  private async generateWithImagen(prompt: string): Promise<string | null> {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_AI_API_KEY is not configured');
    }

    const model = this.imagenModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict`;

    this.logger.log({ msg: 'imagen_generate_start', model, promptLength: prompt.length });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: this.imagenParameters(),
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      this.logger.error({
        msg: 'imagen_generate_failed',
        model,
        status: res.status,
        error: errText.slice(0, 300),
      });
      throw new Error(`Imagen HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as ImagenPredictResponse;
    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (typeof base64 !== 'string' || base64.length === 0) {
      this.logger.warn({ msg: 'imagen_empty_response', model });
      return null;
    }

    this.logger.log({ msg: 'imagen_generate_done', model, bytes: base64.length });
    return base64;
  }
}
