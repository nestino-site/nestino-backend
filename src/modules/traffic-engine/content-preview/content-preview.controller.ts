import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { PipelineStatus } from '@prisma/client';
import { SiteApiKey } from '../../identity/decorators/site-api-key.decorator';
import { ContentPreviewService, PreviewMode } from './content-preview.service';

@Controller('content')
@SiteApiKey()
export class ContentPreviewController {
  constructor(private readonly previewService: ContentPreviewService) {}

  @Get(':pageId/preview')
  async preview(
    @Param('pageId') pageId: string,
    @Query('mode') mode?: PreviewMode,
  ) {
    const safeMode: PreviewMode = mode === 'draft' ? 'draft' : 'final';
    const response = await this.previewService.getPreview(pageId, safeMode);
    const processing = response.status.toUpperCase() !== PipelineStatus.READY;
    return {
      ...response,
      ...(processing ? { httpStatus: HttpStatus.ACCEPTED } : {}),
    };
  }
}

