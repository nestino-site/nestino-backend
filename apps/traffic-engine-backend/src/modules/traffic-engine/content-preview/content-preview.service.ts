import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';
import { MarkdownRendererService } from './markdown-renderer.service';

export type PreviewMode = 'draft' | 'final';

@Injectable()
export class ContentPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: MarkdownRendererService,
  ) {}

  async getPreview(pageId: number, mode: PreviewMode = 'final') {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const rawMarkdown =
      mode === 'draft' ? page.rawDraft ?? page.finalContent ?? '' : page.finalContent ?? page.rawDraft ?? '';
    const markdown = cleanMarkdownOutput(rawMarkdown);
    const html = this.renderer.render(markdown);

    return {
      status: page.pipelineStatus.toLowerCase(),
      markdown,
      html,
      analysis: {
        seoScore: page.seoScore,
        readabilityScore: page.readabilityScore,
        intentMatch: page.intentMatch,
      },
    };
  }
}

