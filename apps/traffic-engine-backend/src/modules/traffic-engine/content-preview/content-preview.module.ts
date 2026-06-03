import { Module } from '@nestjs/common';
import { ContentPreviewController } from './content-preview.controller';
import { ContentPreviewService } from './content-preview.service';
import { MarkdownRendererService } from './markdown-renderer.service';

@Module({
  controllers: [ContentPreviewController],
  providers: [MarkdownRendererService, ContentPreviewService],
  exports: [MarkdownRendererService, ContentPreviewService],
})
export class ContentPreviewModule {}

