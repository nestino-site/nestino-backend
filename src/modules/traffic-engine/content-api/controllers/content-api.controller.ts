import { Controller, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { PipelineStatus } from '@prisma/client';
import type { Request } from 'express';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { SiteApiKey } from '../../../identity/decorators/site-api-key.decorator';
import { SiteScopedApiKey } from '../../../identity/decorators/site-scoped-api-key.decorator';
import { ContentStateManagerService } from '../content-state-manager.service';
import { NextJsContractMapperService } from '../next-js-contract-mapper.service';

@Controller('content')
export class ContentApiController {
  constructor(
    private readonly stateManager: ContentStateManagerService,
    private readonly mapper: NextJsContractMapperService,
  ) {}

  @Get('pages')
  @SiteScopedApiKey()
  async listPublishedPages(@Req() req: Request) {
    const siteId = req.siteId!;
    const pages = await this.stateManager.listPublishedForSite(siteId);
    return {
      items: pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        language: p.language,
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  }

  @Get('by-slug/*path')
  @SiteScopedApiKey()
  async getContentBySlug(@Req() req: Request) {
    const siteId = req.siteId!;
    const slugPath = (req.params as { path?: string }).path ?? '';
    const slug = slugPath.startsWith('/') ? slugPath : `/${slugPath}`;
    const page = await this.stateManager.getStateBySlug(siteId, slug);
    const body = await this.mapper.toContract(page);
    return this.wrapPipelineStatus(page.pipelineStatus, body);
  }

  @Get(':pageId')
  @SiteApiKey()
  @HttpCode(HttpStatus.OK)
  async getContent(@ParseIntParam('pageId') pageId: number) {
    const page = await this.stateManager.getState(pageId);
    const body = await this.mapper.toContract(page);
    return this.wrapPipelineStatus(page.pipelineStatus, body);
  }

  @Get(':pageId/logs')
  @SiteApiKey()
  async getLogs(@ParseIntParam('pageId') pageId: number) {
    const page = await this.stateManager.getState(pageId);
    return {
      pageId,
      logs: page.aiGenerationLogs,
    };
  }

  private wrapPipelineStatus(pipelineStatus: PipelineStatus, body: Awaited<ReturnType<NextJsContractMapperService['toContract']>>) {
    if (
      pipelineStatus !== PipelineStatus.READY &&
      pipelineStatus !== PipelineStatus.FAILED
    ) {
      return {
        ...body,
        httpStatus: HttpStatus.ACCEPTED,
      };
    }
    return body;
  }
}
