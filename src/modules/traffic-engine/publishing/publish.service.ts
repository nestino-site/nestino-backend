import { Injectable, Logger } from '@nestjs/common';
import { PageStatus, PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ContentCacheService } from '../content-api/content-cache.service';
import { ContentRenderService } from '../content-api/content-render.service';
import { PageHeroCdnService } from './page-hero-cdn.service';
import { WebhookDeliveryService } from './webhook-delivery.service';

export interface PublishWebhookPayload {
  pageId: number;
  slug: string;
  siteId: number;
  language: string;
  event: 'page.published' | 'page.updated';
  timestamp: number;
}

export interface PublishResult {
  published: boolean;
  webhookFired: boolean;
  webhookStatus?: number;
  skippedReason?: string;
}

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pageHeroCdn: PageHeroCdnService,
    private readonly webhookDelivery: WebhookDeliveryService,
    private readonly contentCache: ContentCacheService,
    private readonly contentRender: ContentRenderService,
  ) {}

  async publishPage(pageId: number): Promise<PublishResult> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });

    if (!page) {
      return { published: false, webhookFired: false, skippedReason: 'page_not_found' };
    }

    if (page.status === PageStatus.PUBLISHED) {
      return { published: false, webhookFired: false, skippedReason: 'already_published' };
    }

    if (page.pipelineStatus !== PipelineStatus.READY) {
      return {
        published: false,
        webhookFired: false,
        skippedReason: `pipeline_not_ready:${page.pipelineStatus}`,
      };
    }

    await this.pageHeroCdn.uploadHeroOnPublish(pageId);

    const rendered = this.contentRender.renderFromMarkdown(page.finalContent);
    const renderedFields = this.contentRender.toJsonFields(rendered);

    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        status: PageStatus.PUBLISHED,
        publishedAt: new Date(),
        ...renderedFields,
      },
    });

    await this.contentCache.invalidatePage(page.siteId, page.slug, pageId);

    this.logger.log({ msg: 'page_published', pageId, siteId: page.siteId, slug: page.slug });

    let webhookFired = false;
    let webhookStatus: number | undefined;

    if (page.site.publishWebhookUrl) {
      const result = await this.webhookDelivery.enqueue(
        page.siteId,
        pageId,
        page.site.publishWebhookUrl,
        page.site.publishWebhookSecret ?? '',
        {
          pageId,
          slug: page.slug,
          siteId: page.siteId,
          language: page.language,
          event: 'page.published',
          timestamp: Date.now(),
        },
      );
      webhookFired = result.delivered;
      webhookStatus = result.status;
    }

    return { published: true, webhookFired, webhookStatus };
  }

  async triggerUpdateWebhook(pageId: number): Promise<void> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });
    if (!page?.site.publishWebhookUrl || page.status !== PageStatus.PUBLISHED) {
      return;
    }

    await this.contentCache.invalidatePage(page.siteId, page.slug, pageId);

    await this.webhookDelivery.enqueue(
      page.siteId,
      pageId,
      page.site.publishWebhookUrl,
      page.site.publishWebhookSecret ?? '',
      {
        pageId,
        slug: page.slug,
        siteId: page.siteId,
        language: page.language,
        event: 'page.updated',
        timestamp: Date.now(),
      },
    );
  }
}
