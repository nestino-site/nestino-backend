import { createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { WebhookDeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { PublishWebhookPayload } from './publish.service';

const RETRY_BASE_MS = Number(process.env.WEBHOOK_RETRY_BASE_MS ?? 60_000);
const TIMEOUT_MS = Number(process.env.PUBLISH_WEBHOOK_TIMEOUT_MS ?? 5000);

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  buildSignature(secret: string, body: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  }

  async enqueue(
    siteId: number,
    pageId: number,
    url: string,
    secret: string,
    payload: PublishWebhookPayload,
  ): Promise<{ delivered: boolean; status?: number }> {
    const body = JSON.stringify(payload);
    const signature = this.buildSignature(secret, body);

    const result = await this.attemptDelivery(url, body, signature, payload);

    if (result.delivered) {
      return result;
    }

    await this.prisma.webhookDelivery.create({
      data: {
        siteId,
        pageId,
        url,
        payload: payload as object,
        signature,
        status: WebhookDeliveryStatus.PENDING,
        attempts: 1,
        lastStatus: result.status,
        lastError: result.error,
        nextRetryAt: new Date(Date.now() + RETRY_BASE_MS),
      },
    });

    this.logger.warn({
      msg: 'webhook_queued_for_retry',
      pageId,
      url,
      lastStatus: result.status,
    });

    return result;
  }

  async processPendingBatch(limit = 20): Promise<number> {
    const now = new Date();
    const pending = await this.prisma.webhookDelivery.findMany({
      where: {
        status: WebhookDeliveryStatus.PENDING,
        nextRetryAt: { lte: now },
      },
      take: limit,
      orderBy: { nextRetryAt: 'asc' },
    });

    // Prisma doesn't support field comparison in where easily — filter in app
    const eligible = pending.filter((d) => d.attempts < d.maxAttempts);
    let processed = 0;

    for (const delivery of eligible) {
      const payload = delivery.payload as unknown as PublishWebhookPayload;
      const body = JSON.stringify(payload);
      const result = await this.attemptDelivery(delivery.url, body, delivery.signature, payload);

      if (result.delivered) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: WebhookDeliveryStatus.DELIVERED,
            deliveredAt: new Date(),
            lastStatus: result.status,
            lastError: null,
            attempts: delivery.attempts + 1,
          },
        });
        processed++;
        continue;
      }

      const nextAttempts = delivery.attempts + 1;
      const failed = nextAttempts >= delivery.maxAttempts;

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: failed ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
          attempts: nextAttempts,
          lastStatus: result.status,
          lastError: result.error,
          nextRetryAt: new Date(Date.now() + RETRY_BASE_MS * Math.pow(2, nextAttempts - 1)),
        },
      });
      processed++;
    }

    return processed;
  }

  private async attemptDelivery(
    url: string,
    body: string,
    signature: string,
    payload: PublishWebhookPayload,
  ): Promise<{ delivered: boolean; status?: number; error?: string }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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

      if (response.ok) {
        this.logger.log({
          msg: 'publish_webhook_sent',
          url,
          status: response.status,
          pageId: payload.pageId,
        });
        return { delivered: true, status: response.status };
      }

      return {
        delivered: false,
        status: response.status,
        error: `HTTP ${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'publish_webhook_failed', url, error: message, pageId: payload.pageId });
      return { delivered: false, error: message };
    }
  }
}
