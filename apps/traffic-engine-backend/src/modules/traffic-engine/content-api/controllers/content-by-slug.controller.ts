import { Controller, Get, HttpStatus, Req } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PageStatus, PipelineStatus } from '@prisma/client';
import type { Request } from 'express';
import { SiteScopedApiKey } from '../../../identity/decorators/site-scoped-api-key.decorator';
import { ContentCacheService } from '../content-cache.service';
import { ContentStateManagerService } from '../content-state-manager.service';
import { NextJsContractMapperService } from '../next-js-contract-mapper.service';

type ContentContract = Awaited<ReturnType<NextJsContractMapperService['toContract']>>;

/** Express 4.22+ no longer matches `by-slug/*path`; use a mounted sub-path with a regex route. */
@ApiTags('Content API')
@ApiSecurity('site-api-key')
@Controller('content/by-slug')
export class ContentBySlugController {
  constructor(
    private readonly stateManager: ContentStateManagerService,
    private readonly mapper: NextJsContractMapperService,
    private readonly contentCache: ContentCacheService,
  ) {}

  @Get('*')
  @ApiOperation({ summary: 'Get published page content by slug path' })
  @SiteScopedApiKey()
  async getContentBySlug(@Req() req: Request) {
    const siteId = req.siteId!;
    const slugPath = extractSlugPath(req);
    const slug = slugPath ? (slugPath.startsWith('/') ? slugPath : `/${slugPath}`) : '/';

    const cached = await this.contentCache.getBySlug<ContentContract>(siteId, slug);
    if (cached) {
      return cached;
    }

    const page = await this.stateManager.getStateBySlug(siteId, slug);
    const body = await this.mapper.toContract(page);
    const response = wrapPipelineStatus(page.pipelineStatus, body);

    if (page.status === PageStatus.PUBLISHED) {
      await this.contentCache.setBySlug(siteId, slug, response);
    }

    return response;
  }
}

function extractSlugPath(req: Request): string {
  const urlPath = req.originalUrl.split('?')[0] ?? '';
  const marker = '/content/by-slug/';
  const idx = urlPath.indexOf(marker);
  if (idx === -1) {
    return req.path.replace(/^\//, '');
  }
  return decodeURIComponent(urlPath.slice(idx + marker.length));
}

function wrapPipelineStatus(pipelineStatus: PipelineStatus, body: ContentContract) {
  const contentReady =
    body.status === 'ready' ||
    pipelineStatus === PipelineStatus.READY ||
    (Boolean(body.finalContent?.trim()) &&
      (pipelineStatus === PipelineStatus.PARTIALLY_COMPLETED ||
        pipelineStatus === PipelineStatus.FAILED));
  if (!contentReady) {
    return {
      ...body,
      httpStatus: HttpStatus.ACCEPTED,
    };
  }
  return body;
}
