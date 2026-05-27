import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Req, Res } from '@nestjs/common';
import { PageStatus, PipelineStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import sharp from 'sharp';
import { ParseIntParam } from '../../../../common/pipes/parse-int-param.decorator';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { SiteApiKey } from '../../../identity/decorators/site-api-key.decorator';
import { SiteScopedApiKey } from '../../../identity/decorators/site-scoped-api-key.decorator';
import { ContentCacheService } from '../content-cache.service';
import { ContentStateManagerService } from '../content-state-manager.service';
import { NextJsContractMapperService } from '../next-js-contract-mapper.service';

type ContentContract = Awaited<ReturnType<NextJsContractMapperService['toContract']>>;

@Controller('content')
export class ContentApiController {
  constructor(
    private readonly stateManager: ContentStateManagerService,
    private readonly mapper: NextJsContractMapperService,
    private readonly contentCache: ContentCacheService,
    private readonly prisma: PrismaService,
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

    const cached = await this.contentCache.getBySlug<ContentContract>(siteId, slug);
    if (cached) {
      return cached;
    }

    const page = await this.stateManager.getStateBySlug(siteId, slug);
    const body = await this.mapper.toContract(page);
    const response = this.wrapPipelineStatus(page.pipelineStatus, body);

    if (page.status === PageStatus.PUBLISHED) {
      await this.contentCache.setBySlug(siteId, slug, response);
    }

    return response;
  }

  @Get(':pageId')
  @SiteApiKey()
  @HttpCode(HttpStatus.OK)
  async getContent(@ParseIntParam('pageId') pageId: number) {
    const cached = await this.contentCache.getByPageId<ContentContract>(pageId);
    if (cached) {
      return cached;
    }

    const page = await this.stateManager.getState(pageId);
    const body = await this.mapper.toContract(page);
    const response = this.wrapPipelineStatus(page.pipelineStatus, body);

    if (page.status === PageStatus.PUBLISHED) {
      await this.contentCache.setByPageId(pageId, response);
      await this.contentCache.setBySlug(page.siteId, page.slug, response);
    }

    return response;
  }

  @Get(':pageId/hero-image')
  @SiteApiKey()
  async getHeroImage(
    @ParseIntParam('pageId') pageId: number,
    @Res({ passthrough: false }) res: Response,
  ) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: {
        generatedImageCdnUrl: true,
        generatedImageBase64: true,
      },
    });

    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    if (page.generatedImageCdnUrl) {
      return res.redirect(302, page.generatedImageCdnUrl);
    }

    if (!page.generatedImageBase64) {
      throw new NotFoundException(`Page ${pageId} has no hero image`);
    }

    const webpBuffer = await sharp(Buffer.from(page.generatedImageBase64, 'base64'))
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.send(webpBuffer);
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

  private wrapPipelineStatus(pipelineStatus: PipelineStatus, body: ContentContract) {
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
}
