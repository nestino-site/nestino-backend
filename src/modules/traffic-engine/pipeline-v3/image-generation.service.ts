import { Injectable } from '@nestjs/common';
import { KeywordIntent } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiExecutionService } from '../ai/execution/ai-execution.service';

interface ImagenPredictResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
  }>;
}

@Injectable()
export class ImageGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiExecution: AiExecutionService,
  ) {}

  async generate(
    pageId: string,
    siteId: string,
    finalContent: string,
    keyword: string,
    priority: number,
    intent: KeywordIntent,
  ): Promise<{ imagePrompt: string; generatedImageBase64: string | null }> {
    const promptOutput = await this.aiExecution.execute({
      step: 'image_generation',
      siteId,
      pageId,
      priority,
      intent,
      runtimeContext: {
        keyword,
        finalContent,
      },
      maxOutputTokens: 300,
    });

    const imagePrompt = promptOutput.text.trim();
    let generatedImageBase64: string | null = null;

    if (imagePrompt) {
      generatedImageBase64 = await this.generateWithImagen(imagePrompt);
    }

    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        imagePrompt,
        generatedImageBase64,
      },
    });

    return { imagePrompt, generatedImageBase64 };
  }

  private async generateWithImagen(prompt: string): Promise<string | null> {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_AI_API_KEY is not configured');
    }

    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict' +
      `?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Imagen HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as ImagenPredictResponse;
    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
    return typeof base64 === 'string' && base64.length > 0 ? base64 : null;
  }
}
