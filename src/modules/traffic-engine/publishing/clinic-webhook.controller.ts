import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ContentTasksService } from '../content-tasks/services/content-tasks.service';

interface ClinicPublishedWebhookPayload {
  event: 'CLINIC_PUBLISHED' | 'CLINIC_UPDATED' | 'TRUTH_SCORE_CHANGED';
  clinicId: number;
  slug: string;
  name: string;
  citySlug?: string;
  countryCode?: string;
  status: string;
  publishedAt?: string;
  // truth score fields
  composite?: number;
  grade?: string;
}

function buildMedicalBusinessSchema(payload: ClinicPublishedWebhookPayload): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: payload.name,
    medicalSpecialty: 'Reproductive Medicine',
    url: `https://sindibed.com/clinics/${payload.citySlug ?? ''}/${payload.slug}`,
    address: {
      '@type': 'PostalAddress',
      addressCountry: payload.countryCode,
    },
  };
}

function verifyHmacSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

@ApiTags('Clinic Inventory Webhook')
@Controller('clinic-inventory')
export class ClinicWebhookController {
  private readonly logger = new Logger(ClinicWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentTasksService: ContentTasksService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inbound webhook from clinic-inventory (clinic published/updated)' })
  async handleClinicWebhook(
    @Body() payload: ClinicPublishedWebhookPayload,
    @Headers('x-clinic-signature') signature: string,
    @Headers('x-event-type') eventType: string,
  ): Promise<{ ok: boolean }> {
    const secret = process.env.TRAFFIC_ENGINE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('TRAFFIC_ENGINE_WEBHOOK_SECRET not configured — skipping signature check');
    } else {
      const rawBody = JSON.stringify(payload);
      if (!signature || !verifyHmacSignature(rawBody, signature, secret)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const event = eventType ?? payload.event;
    this.logger.log(`Received clinic webhook: ${event} for clinic ${payload.clinicId}`);

    if (event === 'CLINIC_PUBLISHED' || event === 'CLINIC_UPDATED') {
      await this.upsertClinicPage(payload);
    } else if (event === 'TRUTH_SCORE_CHANGED') {
      await this.updatePageSchema(payload);
    }

    return { ok: true };
  }

  private async upsertClinicPage(payload: ClinicPublishedWebhookPayload): Promise<void> {
    const clinicSiteId = Number(process.env.CLINIC_SITE_ID ?? '0');
    if (!clinicSiteId) {
      this.logger.warn('CLINIC_SITE_ID not set — cannot upsert clinic page');
      return;
    }

    const site = await this.prisma.site.findUnique({ where: { id: clinicSiteId } });
    if (!site) {
      this.logger.warn(`Site ${clinicSiteId} not found`);
      return;
    }

    const slug = `/clinics/${payload.citySlug ?? 'unknown'}/${payload.slug}`;
    const schemaMarkup = buildMedicalBusinessSchema(payload);

    // Find or create a keyword for this clinic page
    const keywordText = `${payload.name} IVF clinic ${payload.citySlug ?? ''}`.trim();
    let keyword = await this.prisma.keyword.findFirst({
      where: { siteId: clinicSiteId, keyword: keywordText },
    });

    if (!keyword) {
      keyword = await this.prisma.keyword.create({
        data: {
          siteId: clinicSiteId,
          keyword: keywordText,
          language: 'EN',
          intent: 'COMMERCIAL',
          priority: 5,
        },
      });
    }

    // Upsert the Page
    const existingPage = await this.prisma.page.findFirst({
      where: { siteId: clinicSiteId, slug },
    });

    let page;
    if (existingPage) {
      page = await this.prisma.page.update({
        where: { id: existingPage.id },
        data: {
          title: payload.name,
          metaTitle: `${payload.name} — IVF Clinic Review & Verified Patient Truth Score`,
          metaDescription: `Verified patient interviews, transparent pricing and Truth Score for ${payload.name}. Real cost breakdowns and outcomes from real patients.`,
          schemaMarkup: schemaMarkup,
          status: 'PUBLISHED',
          publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : new Date(),
        },
      });
      this.logger.log(`Updated Page ${page.id} for clinic ${payload.name}`);
    } else {
      page = await this.prisma.page.create({
        data: {
          siteId: clinicSiteId,
          keywordId: keyword.id,
          language: 'EN',
          slug,
          title: payload.name,
          metaTitle: `${payload.name} — IVF Clinic Review & Verified Patient Truth Score`,
          metaDescription: `Verified patient interviews, transparent pricing and Truth Score for ${payload.name}. Real cost breakdowns and outcomes from real patients.`,
          schemaMarkup: schemaMarkup,
          status: 'DRAFT',
        },
      });
      this.logger.log(`Created Page ${page.id} for clinic ${payload.name}`);

      // Enqueue AI content generation for the new page
      try {
        await this.contentTasksService.create({
          siteId: clinicSiteId,
          pageId: page.id,
          type: TaskType.GENERATE_CONTENT,
        });
        this.logger.log(`Enqueued AI generation for page ${page.id}`);
      } catch (err) {
        this.logger.error(`Failed to enqueue content task for page ${page.id}: ${String(err)}`);
      }
    }
  }

  private async updatePageSchema(payload: ClinicPublishedWebhookPayload): Promise<void> {
    const clinicSiteId = Number(process.env.CLINIC_SITE_ID ?? '0');
    if (!clinicSiteId) return;

    const slug = `/clinics/${payload.citySlug ?? 'unknown'}/${payload.slug}`;
    const page = await this.prisma.page.findFirst({ where: { siteId: clinicSiteId, slug } });
    if (!page) return;

    const updatedSchema = {
      ...buildMedicalBusinessSchema(payload),
      ...(payload.composite != null
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: payload.composite,
              bestRating: 100,
              worstRating: 0,
              ratingCount: 0,
            },
          }
        : {}),
    };

    await this.prisma.page.update({
      where: { id: page.id },
      data: { schemaMarkup: updatedSchema },
    });
    this.logger.log(`Updated schema markup for page ${page.id} with Truth Score grade=${payload.grade}`);
  }
}
