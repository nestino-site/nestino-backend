import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PipelineStatus } from '@prisma/client';
import { SiteApiKey } from '../../identity/decorators/site-api-key.decorator';
import { ParseIntParam } from '../../../common/pipes/parse-int-param.decorator';
import { ContentPreviewService, PreviewMode } from './content-preview.service';

@ApiTags('Content Preview')
@ApiSecurity('site-api-key')
@Controller('content')
@SiteApiKey()
export class ContentPreviewController {
  constructor(private readonly previewService: ContentPreviewService) {}

  @Get(':pageId/preview')
  @ApiOperation({ summary: 'Preview draft or final page content (site API key)' })
  @ApiParam({ name: 'pageId', type: Number, example: 100 })
  @ApiQuery({ name: 'mode', enum: ['draft', 'final'], required: false, example: 'final' })
  async preview(
    @ParseIntParam('pageId') pageId: number,
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
