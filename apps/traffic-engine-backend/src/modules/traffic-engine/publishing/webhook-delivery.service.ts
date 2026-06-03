import { createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { WebhookDeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { PublishWebhookPayload } from './publish.service';
import { formatFetchError, resolveWebhookDeliveryUrl } from './webhook-url.util';

const RETRY_BASE_MS = Number(process.env.WEBHOOK_RETRY_BASE_MS ?? 60_000);
const TIMEOUT_MS = Number(process.env.PUBLISH_WEBHOOK_TIMEOUT_MS ?? 15_000);

export interface WebhookDeliveryAttemptResult {
  delivered: boolean;
  status?: number;
  error?: string;
  queuedForRetry?: boolean;
  deliveryUrl?: string;
  configuredUrl?: string;
  attemptUrls?: string[];
}

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
  ): Promise<WebhookDeliveryAttemptResult> {
    const body = JSON.stringify(payload);
    const signature = this.buildSignature(secret, body);

    const result = await this.attemptDelivery(url, body, signature, payload, secret.length > 0);

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
      configuredUrl: url,
      deliveryUrl: result.deliveryUrl,
      attemptUrls: result.attemptUrls,
      lastStatus: result.status,
      error: result.error,
    });

    return { ...result, queuedForRetry: true };
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

    const eligible = pending.filter((d) => d.attempts < d.maxAttempts);
    let processed = 0;

    for (const delivery of eligible) {
      const payload = delivery.payload as unknown as PublishWebhookPayload;
      const body = JSON.stringify(payload);
      const result = await this.attemptDelivery(
        delivery.url,
        body,
        delivery.signature,
        payload,
        delivery.signature.length > 0,
      );

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
    configuredUrl: string,
    body: string,
    signature: string,
    payload: PublishWebhookPayload,
    hasSecret: boolean,
  ): Promise<WebhookDeliveryAttemptResult> {
    const { primaryUrl, fallbackUrls, normalizedFrom } = resolveWebhookDeliveryUrl(configuredUrl);
    const attemptUrls = [primaryUrl, ...fallbackUrls.filter((u) => u !== primaryUrl)];

    this.logger.log({
      msg: 'publish_webhook_attempt',
      pageId: payload.pageId,
      siteId: payload.siteId,
      event: payload.event,
      slug: payload.slug,
      configuredUrl,
      normalizedFrom: normalizedFrom !== primaryUrl ? { from: normalizedFrom, to: primaryUrl } : undefined,
      attemptUrls,
      hasSecret,
      timeoutMs: TIMEOUT_MS,
    });

    let lastResult: WebhookDeliveryAttemptResult = {
      delivered: false,
      configuredUrl,
      attemptUrls,
    };

    for (const deliveryUrl of attemptUrls) {
      const result = await this.postWebhook(deliveryUrl, body, signature, payload);
      lastResult = {
        ...result,
        deliveryUrl,
        configuredUrl,
        attemptUrls,
      };

      if (result.delivered) {
        return lastResult;
      }

      this.logger.warn({
        msg: 'publish_webhook_attempt_failed',
        pageId: payload.pageId,
        deliveryUrl,
        status: result.status,
        error: result.error,
        willTryFallback: deliveryUrl !== attemptUrls[attemptUrls.length - 1],
      });
    }

    return lastResult;
  }

  private async postWebhook(
    url: string,
    body: string,
    signature: string,
    payload: PublishWebhookPayload,
  ): Promise<{ delivered: boolean; status?: number; error?: string }> {
    const startedAt = Date.now();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Publish-Signature': signature,
          'X-Publish-Timestamp': String(payload.timestamp),
          'User-Agent': 'Nestino-TrafficEngine-Webhook/1.0',
        },
        body,
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timer);

      const durationMs = Date.now() - startedAt;
      const responseUrl = response.url;
      let responseSnippet: string | undefined;

      if (!response.ok) {
        try {
          responseSnippet = (await response.text()).slice(0, 200);
        } catch {
          responseSnippet = undefined;
        }
      }

      if (response.ok) {
        this.logger.log({
          msg: 'publish_webhook_sent',
          url,
          responseUrl: responseUrl !== url ? responseUrl : undefined,
          status: response.status,
          durationMs,
          pageId: payload.pageId,
          event: payload.event,
        });
        return { delivered: true, status: response.status };
      }

      this.logger.warn({
        msg: 'publish_webhook_http_error',
        url,
        responseUrl: responseUrl !== url ? responseUrl : undefined,
        status: response.status,
        durationMs,
        pageId: payload.pageId,
        responseSnippet,
      });

      return {
        delivered: false,
        status: response.status,
        error: `HTTP ${response.status}${responseSnippet ? `: ${responseSnippet}` : ''}`,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const formatted = formatFetchError(error);

      this.logger.warn({
        msg: 'publish_webhook_failed',
        url,
        pageId: payload.pageId,
        event: payload.event,
        durationMs,
        error: formatted.message,
        causeCode: formatted.causeCode,
        causeMessage: formatted.causeMessage,
        aborted: formatted.aborted,
      });

      return { delivered: false, error: formatted.message };
    }
  }
}
