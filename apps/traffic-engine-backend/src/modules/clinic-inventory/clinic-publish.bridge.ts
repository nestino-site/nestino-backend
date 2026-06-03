import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WebhookEventType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ClinicPublishedWebhookPayload,
  ClinicWebhookHandlerService,
} from '../traffic-engine/publishing/clinic-webhook-handler.service';

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

@Injectable()
export class ClinicPublishBridge {
  private readonly logger = new Logger(ClinicPublishBridge.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookHandler: ClinicWebhookHandlerService,
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
      countrySlug: clinic.country?.name
        ? slugify(clinic.country.name)
        : clinic.country?.codeIso2?.toLowerCase(),
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
        .filter((item: { isOffered: boolean }) => item.isOffered)
        .map((item: { treatment: { code: string } }) => item.treatment.code),
      status: clinic.status,
      publishedAt: clinic.publishedAt?.toISOString() ?? new Date().toISOString(),
    };

    await this.processEvent('CLINIC_PUBLISHED', payload);
  }

  async emitTruthScoreChanged(clinicId: number): Promise<void> {
    const score = await this.prisma.clinicTruthScore.findUnique({ where: { clinicId } });
    if (!score) return;

    await this.processEvent('TRUTH_SCORE_CHANGED', {
      clinicId,
      composite: score.composite ?? undefined,
      grade: score.grade as string | null,
      status: score.status as string,
      slug: '',
      name: '',
      publishedAt: new Date().toISOString(),
    });
  }

  private async processEvent(
    event: WebhookEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const delivery = await this.prisma.clinicWebhookDelivery.create({
      data: {
        clinicId: payload.clinicId as number,
        event,
        url: 'in-process',
        payload: payload as Prisma.InputJsonValue,
        signature: 'in-process',
        status: 'PENDING',
        nextRetryAt: new Date(),
      },
    });

    try {
      await this.webhookHandler.handleEvent(
        event,
        payload as unknown as ClinicPublishedWebhookPayload,
      );

      await this.prisma.clinicWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'DELIVERED',
          lastStatus: 200,
          attempts: 1,
          deliveredAt: new Date(),
        },
      });
      this.logger.log(`In-process clinic event ${event} handled for clinic ${payload.clinicId}`);
    } catch (err) {
      await this.prisma.clinicWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          lastError: String(err),
          attempts: 1,
        },
      });
      this.logger.error(`In-process clinic event ${event} failed for clinic ${payload.clinicId}: ${String(err)}`);
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
