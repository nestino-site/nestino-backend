import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WebhookEventType, Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import axios from 'axios';
import { CLINIC_WEBHOOK_QUEUE } from '../../../common/constants/queue.constants';

export interface ClinicPublishedPayload extends Record<string, unknown> {
  clinicId: number;
  slug: string;
  name: string;
  citySlug?: string;
  countrySlug?: string;
  countryCode?: string;
  address?: string;
  phone?: string;
  website?: string;
  googleRating?: number;
  googleReviewCount?: number;
  googleMapsUrl?: string;
  editorialSummary?: string;
  openingHours?: unknown;
  treatments?: string[];
  status: string;
  publishedAt: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(CLINIC_WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  async emitClinicPublished(clinicId: number): Promise<void> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      include: {
        city: true,
        country: true,
        treatments: { include: { treatment: true } },
      },
    });
    if (!clinic) return;

    const payload: ClinicPublishedPayload = {
      clinicId: clinic.id,
      slug: clinic.slug,
      name: clinic.name,
      citySlug: clinic.city?.slug,
      countrySlug: clinic.country?.name ? slugify(clinic.country.name) : clinic.country?.codeIso2?.toLowerCase(),
      countryCode: clinic.country?.codeIso2,
      address: clinic.addressLine ?? undefined,
      phone: clinic.phone ?? clinic.formattedPhone ?? undefined,
      website: clinic.websiteUrl ?? undefined,
      googleRating: clinic.googleRating ? Number(clinic.googleRating) : undefined,
      googleReviewCount: clinic.googleReviewCount ?? undefined,
      googleMapsUrl: clinic.googleMapsUrl ?? undefined,
      editorialSummary: clinic.editorialSummary ?? undefined,
      openingHours: clinic.openingHours ?? undefined,
      treatments: clinic.treatments
        .filter((item) => item.isOffered)
        .map((item) => item.treatment.code),
      status: clinic.status,
      publishedAt: clinic.publishedAt?.toISOString() ?? new Date().toISOString(),
    };

    await this.enqueueWebhook(clinicId, 'CLINIC_PUBLISHED', payload);
  }

  async emitTruthScoreChanged(clinicId: number): Promise<void> {
    const score = await this.prisma.clinicTruthScore.findUnique({ where: { clinicId } });
    if (!score) return;
    await this.enqueueWebhook(clinicId, 'TRUTH_SCORE_CHANGED', {
      clinicId,
      composite: score.composite,
      grade: score.grade as string | null,
      status: score.status as string,
    });
  }

  private async enqueueWebhook(
    clinicId: number,
    event: WebhookEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const url = this.config.get<string>('TRAFFIC_ENGINE_WEBHOOK_URL');
    if (!url) {
      this.logger.warn('TRAFFIC_ENGINE_WEBHOOK_URL not set — skipping webhook');
      return;
    }

    const secret = this.config.get<string>('TRAFFIC_ENGINE_WEBHOOK_SECRET') ?? '';
    const body = stableStringify({ event, ...payload });
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    const delivery = await this.prisma.clinicWebhookDelivery.create({
      data: {
        clinicId,
        event,
        url,
        payload: payload as Prisma.InputJsonValue,
        signature: `sha256=${signature}`,
        nextRetryAt: new Date(),
      },
    });

    await this.webhookQueue.add(
      'webhook.deliver',
      { deliveryId: delivery.id },
      { jobId: `webhook-${delivery.id}`, attempts: 5, backoff: { type: 'exponential', delay: 60000 } },
    );
  }

  // ── Called by BullMQ processor ────────────────────────────────────────────

  async deliverWebhook(deliveryId: number): Promise<void> {
    const delivery = await this.prisma.clinicWebhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.status === 'DELIVERED') return;

    const payload = { event: delivery.event, ...(delivery.payload as object) };
    const body = stableStringify(payload);
    const secret = this.config.get<string>('TRAFFIC_ENGINE_WEBHOOK_SECRET') ?? '';
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const attempt = delivery.attempts + 1;

    try {
      const response = await axios.post(delivery.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Clinic-Signature': signature,
          'X-Event-Type': delivery.event,
        },
        timeout: 15000,
      });

      await this.prisma.clinicWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'DELIVERED',
          lastStatus: response.status,
          signature,
          attempts: attempt,
          deliveredAt: new Date(),
        },
      });
      this.logger.log(`Webhook ${deliveryId} (${delivery.event}) delivered`);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : null;
      const nextRetryAt = new Date(Date.now() + Math.pow(2, attempt) * 60000);

      await this.prisma.clinicWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: attempt >= delivery.maxAttempts ? 'FAILED' : 'PENDING',
          lastStatus: status ?? null,
          lastError: String(err),
          attempts: attempt,
          nextRetryAt,
        },
      });

      if (attempt >= delivery.maxAttempts) {
        this.logger.error(`Webhook ${deliveryId} permanently failed after ${attempt} attempts`);
      }
      throw err;
    }
  }

  listDeliveries(clinicId?: number) {
    return this.prisma.clinicWebhookDelivery.findMany({
      where: clinicId ? { clinicId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
