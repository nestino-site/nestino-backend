import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PageStatus, PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { buildAffectedPaths } from '../content-api/seo/page-type.util';
import { ContentCacheService } from '../content-api/content-cache.service';
import { ContentRenderService } from '../content-api/content-render.service';
import { PageSeoEnricherService } from '../content-api/seo/page-seo-enricher.service';
import { PageHeroCdnService } from './page-hero-cdn.service';
import { WebhookDeliveryService } from './webhook-delivery.service';

export interface PublishWebhookPayload {
  pageId: number;
  slug: string;
  siteId: number;
  language: string;
  event: 'page.published' | 'page.updated' | 'clinic.updated';
  timestamp: number;
  pageType?: string;
  affectedPaths?: string[];
  clinicId?: number;
}

export interface PublishResult {
  published: boolean;
  webhookFired: boolean;
  webhookStatus?: number;
  webhookError?: string;
  webhookQueuedForRetry?: boolean;
  webhookSkippedReason?: 'no_webhook_url';
  webhookUrl?: string;
  configuredWebhookUrl?: string;
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
    private readonly pageSeoEnricher: PageSeoEnricherService,
  ) {}

  async publishPage(pageId: number): Promise<PublishResult> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });

    if (!page) {
      return { published: false, webhookFired: false, skippedReason: 'page_not_found' };
    }

    const isRepublish = page.status === PageStatus.PUBLISHED;
    const hasPublishableContent = Boolean(page.finalContent?.trim());

    if (!isRepublish && page.pipelineStatus !== PipelineStatus.READY) {
      const humanReviewPublish =
        hasPublishableContent &&
        (page.pipelineStatus === PipelineStatus.PARTIALLY_COMPLETED ||
          page.pipelineStatus === PipelineStatus.FAILED);
      if (!humanReviewPublish) {
        return {
          published: false,
          webhookFired: false,
          skippedReason: `pipeline_not_ready:${page.pipelineStatus}`,
        };
      }
      this.logger.warn({
        msg: 'publish_after_human_review',
        pageId,
        pipelineStatus: page.pipelineStatus,
      });
    }

    if (!hasPublishableContent) {
      return {
        published: false,
        webhookFired: false,
        skippedReason: 'missing_final_content',
      };
    }

    const seoError = this.pageSeoEnricher.validateIndexableSeo({
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      schemaMarkup: page.schemaMarkup,
      robotsMeta: page.robotsMeta,
    });
    if (page.pageType && seoError && !page.robotsMeta?.includes('noindex')) {
      throw new BadRequestException(`Cannot publish page ${pageId}: ${seoError}`);
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

    const webhookEvent: PublishWebhookPayload['event'] = isRepublish
      ? 'page.updated'
      : 'page.published';
    this.logger.log({
      msg: isRepublish ? 'page_republished' : 'page_published',
      pageId,
      siteId: page.siteId,
      slug: page.slug,
    });

    const webhookUrl = page.site.publishWebhookUrl?.trim();
    if (!webhookUrl) {
      this.logger.warn({ msg: 'publish_webhook_skipped', pageId, reason: 'no_webhook_url' });
      return {
        published: true,
        webhookFired: false,
        webhookSkippedReason: 'no_webhook_url',
      };
    }

    const hasWebhookSecret = Boolean(page.site.publishWebhookSecret?.trim());
    if (!hasWebhookSecret) {
      this.logger.warn({
        msg: 'publish_webhook_missing_secret',
        pageId,
        siteId: page.siteId,
        url: webhookUrl,
      });
    }

    const result = await this.webhookDelivery.enqueue(
      page.siteId,
      pageId,
      webhookUrl,
      page.site.publishWebhookSecret ?? '',
      {
        pageId,
        slug: page.slug,
        siteId: page.siteId,
        language: page.language,
        event: webhookEvent,
        timestamp: Date.now(),
        pageType: page.pageType ?? undefined,
        affectedPaths: buildAffectedPaths(page.slug, page.pageType ?? undefined),
      },
    );

    if (!result.delivered) {
      this.logger.warn({
        msg: 'publish_webhook_not_delivered',
        pageId,
        siteId: page.siteId,
        slug: page.slug,
        event: webhookEvent,
        configuredUrl: webhookUrl,
        deliveryUrl: result.deliveryUrl,
        attemptUrls: result.attemptUrls,
        status: result.status,
        error: result.error,
        queuedForRetry: result.queuedForRetry,
      });
    }

    return {
      published: true,
      webhookFired: result.delivered,
      webhookStatus: result.status,
      webhookError: result.error,
      webhookQueuedForRetry: result.queuedForRetry,
      ...(result.delivered
        ? {}
        : { webhookUrl: result.deliveryUrl ?? webhookUrl, configuredWebhookUrl: webhookUrl }),
    };
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
        pageType: page.pageType ?? undefined,
        affectedPaths: buildAffectedPaths(page.slug, page.pageType ?? undefined),
      },
    );
  }

  async fireClinicUpdatedWebhook(input: {
    clinicId: number;
    siteId: number;
    pdpSlug: string;
    affectedPaths: string[];
  }): Promise<void> {
    const site = await this.prisma.site.findUnique({ where: { id: input.siteId } });
    const webhookUrl = site?.publishWebhookUrl?.trim();
    if (!webhookUrl || !site) return;

    const pdpPage = await this.prisma.page.findFirst({
      where: { siteId: input.siteId, slug: input.pdpSlug },
      select: { id: true },
    });

    const pageId = pdpPage?.id ?? 0;

    await this.webhookDelivery.enqueue(
      input.siteId,
      pageId,
      webhookUrl,
      site.publishWebhookSecret ?? '',
      {
        event: 'clinic.updated',
        clinicId: input.clinicId,
        affectedPaths: input.affectedPaths,
        siteId: input.siteId,
        timestamp: Date.now(),
        pageId,
        slug: input.pdpSlug,
        language: 'EN',
      },
    );
  }
}

