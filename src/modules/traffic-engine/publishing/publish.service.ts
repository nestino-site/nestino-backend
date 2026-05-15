import { createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { PageStatus, PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface PublishWebhookPayload {
  pageId: number;
  slug: string;
  siteId: number;
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
  private readonly timeoutMs =
    Number(process.env.PUBLISH_WEBHOOK_TIMEOUT_MS ?? 5000);

  constructor(private readonly prisma: PrismaService) {}

  async publishPage(pageId: number): Promise<PublishResult> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });

    if (!page) {
      return { published: false, webhookFired: false, skippedReason: 'page_not_found' };
    }

    // Idempotency: already published
    if (page.status === PageStatus.PUBLISHED) {
      return { published: false, webhookFired: false, skippedReason: 'already_published' };
    }

    // Only publish pages whose pipeline is READY
    if (page.pipelineStatus !== PipelineStatus.READY) {
      return {
        published: false,
        webhookFired: false,
        skippedReason: `pipeline_not_ready:${page.pipelineStatus}`,
      };
    }

    await this.prisma.page.update({
      where: { id: pageId },
      data: { status: PageStatus.PUBLISHED, publishedAt: new Date() },
    });

    this.logger.log({ msg: 'page_published', pageId, siteId: page.siteId, slug: page.slug });

    let webhookFired = false;
    let webhookStatus: number | undefined;

    if (page.site.publishWebhookUrl) {
      const result = await this.fireWebhook(page.site.publishWebhookUrl, page.site.publishWebhookSecret ?? '', {
        pageId,
        slug: page.slug,
        siteId: page.siteId,
        event: 'page.published',
        timestamp: Date.now(),
      });
      webhookFired = result.fired;
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
    await this.fireWebhook(page.site.publishWebhookUrl, page.site.publishWebhookSecret ?? '', {
      pageId,
      slug: page.slug,
      siteId: page.siteId,
      event: 'page.updated',
      timestamp: Date.now(),
    });
  }

  private async fireWebhook(
    url: string,
    secret: string,
    payload: PublishWebhookPayload,
  ): Promise<{ fired: boolean; status?: number }> {
    const body = JSON.stringify(payload);
    const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Publish-Signature': signature,
          'X-Publish-Timestamp': String(payload.timestamp),
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      this.logger.log({
        msg: 'publish_webhook_sent',
        url,
        status: response.status,
        pageId: payload.pageId,
      });

      return { fired: true, status: response.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'publish_webhook_failed', url, error: message, pageId: payload.pageId });
      return { fired: false };
    }
  }
}
