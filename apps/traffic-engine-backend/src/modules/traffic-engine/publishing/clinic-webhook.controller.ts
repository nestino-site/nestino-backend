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
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ContentTasksService } from '../content-tasks/services/content-tasks.service';
import { ClinicWebhookPayloadDto } from './dto/clinic-webhook-payload.dto';
import { Public } from '../../identity/decorators/public.decorator';

interface ClinicPublishedWebhookPayload {
  event: 'CLINIC_PUBLISHED' | 'CLINIC_UPDATED' | 'TRUTH_SCORE_CHANGED';
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
  publishedAt?: string;
  composite?: number;
  grade?: string;
}

interface ClinicPageSpec {
  slug: string;
  keyword: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  priority: number;
  schemaMarkup: object;
}

const DEFAULT_CLINIC_SITE_DOMAIN = 'medcover.io';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function displayNameFromSlug(slug?: string): string {
  return (slug ?? 'unknown')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function buildMedicalBusinessSchema(payload: ClinicPublishedWebhookPayload): object {
  const siteDomain = process.env.CLINIC_SITE_DOMAIN ?? DEFAULT_CLINIC_SITE_DOMAIN;
  const countrySlug = payload.countrySlug ?? payload.countryCode?.toLowerCase() ?? 'unknown';
  const citySlug = payload.citySlug ?? 'unknown';

  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: payload.name,
    medicalSpecialty: 'Reproductive Medicine',
    url: `https://${siteDomain}/clinics/${countrySlug}/${citySlug}/${payload.slug}`,
    telephone: payload.phone,
    sameAs: [payload.website, payload.googleMapsUrl].filter(Boolean),
    address: {
      '@type': 'PostalAddress',
      streetAddress: payload.address,
      addressCountry: payload.countryCode,
    },
    ...(payload.googleRating != null
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: payload.googleRating,
            bestRating: 5,
            worstRating: 1,
            ratingCount: payload.googleReviewCount ?? 0,
          },
        }
      : {}),
  };
}

function buildClinicPageSpecs(payload: ClinicPublishedWebhookPayload): ClinicPageSpec[] {
  const countrySlug = payload.countrySlug ?? payload.countryCode?.toLowerCase() ?? 'unknown';
  const citySlug = payload.citySlug ?? 'unknown';
  const countryName = displayNameFromSlug(countrySlug);
  const cityName = displayNameFromSlug(citySlug);
  const treatments = payload.treatments?.length ? payload.treatments : ['IVF'];
  const clinicSchema = buildMedicalBusinessSchema(payload);

  const specs: ClinicPageSpec[] = [
    {
      slug: `/clinics/${countrySlug}/${citySlug}/${payload.slug}`,
      keyword: `${payload.name} IVF clinic ${cityName}`,
      title: payload.name,
      metaTitle: `${payload.name} - IVF Clinic Review & Verified Patient Truth Score`,
      metaDescription: `Verified patient interviews, transparent pricing, Google reviews and Truth Score for ${payload.name} in ${cityName}.`,
      priority: 5,
      schemaMarkup: clinicSchema,
    },
    {
      slug: `/clinics/${countrySlug}/${citySlug}`,
      keyword: `IVF clinics ${cityName}`,
      title: `IVF Clinics in ${cityName}`,
      metaTitle: `Best IVF Clinics in ${cityName} - Verified Patient Data`,
      metaDescription: `Compare IVF clinics in ${cityName} using verified patient interviews, Google data, pricing transparency and clinic profiles.`,
      priority: 4,
      schemaMarkup: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `IVF Clinics in ${cityName}`,
        about: clinicSchema,
      },
    },
    {
      slug: `/clinics/${countrySlug}`,
      keyword: `IVF clinics ${countryName}`,
      title: `IVF Clinics in ${countryName}`,
      metaTitle: `Best IVF Clinics in ${countryName} - Verified Patient Data`,
      metaDescription: `Explore IVF clinics in ${countryName} by city, treatment type, Google data and verified patient experience.`,
      priority: 4,
      schemaMarkup: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `IVF Clinics in ${countryName}`,
        about: clinicSchema,
      },
    },
  ];

  for (const treatment of treatments) {
    const treatmentSlug = slugify(treatment);
    const treatmentName = displayNameFromSlug(treatmentSlug);
    specs.push({
      slug: `/clinics/treatment/${treatmentSlug}`,
      keyword: `${treatmentName} clinics ${countryName}`,
      title: `${treatmentName} Clinics`,
      metaTitle: `${treatmentName} Clinics - Verified Clinic Directory`,
      metaDescription: `Find clinics offering ${treatmentName}, with verified clinic data, patient interviews, Google data and transparent profile pages.`,
      priority: 3,
      schemaMarkup: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${treatmentName} Clinics`,
        about: clinicSchema,
      },
    });
  }

  return specs;
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
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Inbound webhook from clinic-inventory (clinic published/updated)' })
  @ApiHeader({ name: 'x-clinic-signature', required: true, description: 'HMAC SHA256 signature' })
  @ApiHeader({ name: 'x-event-type', required: true, description: 'Event type override' })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handleClinicWebhook(
    @Body() payload: ClinicWebhookPayloadDto,
    @Headers('x-clinic-signature') signature: string,
    @Headers('x-event-type') eventType: string,
  ): Promise<{ ok: boolean }> {
    const secret = process.env.TRAFFIC_ENGINE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('TRAFFIC_ENGINE_WEBHOOK_SECRET not configured — skipping signature check');
    } else {
      const rawBody = stableStringify(payload);
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
    const site = await this.getClinicSite();
    if (!site) {
      return;
    }

    const specs = buildClinicPageSpecs(payload);
    for (const spec of specs) {
      await this.upsertGeneratedPage(site.id, payload, spec);
    }
  }

  private async upsertGeneratedPage(
    clinicSiteId: number,
    payload: ClinicPublishedWebhookPayload,
    spec: ClinicPageSpec,
  ): Promise<void> {
    let keyword = await this.prisma.keyword.findFirst({
      where: { siteId: clinicSiteId, keyword: spec.keyword },
    });

    if (!keyword) {
      keyword = await this.prisma.keyword.create({
        data: {
          siteId: clinicSiteId,
          keyword: spec.keyword,
          language: 'EN',
          intent: 'COMMERCIAL',
          priority: spec.priority,
          targetUrl: spec.slug,
        },
      });
    }

    const existingPage = await this.prisma.page.findFirst({
      where: { siteId: clinicSiteId, slug: spec.slug },
    });

    let page;
    if (existingPage) {
      page = await this.prisma.page.update({
        where: { id: existingPage.id },
        data: {
          title: spec.title,
          metaTitle: spec.metaTitle,
          metaDescription: spec.metaDescription,
          schemaMarkup: spec.schemaMarkup,
        },
      });
      this.logger.log(`Updated Page ${page.id} (${spec.slug}) for clinic ${payload.name}`);
    } else {
      page = await this.prisma.page.create({
        data: {
          siteId: clinicSiteId,
          keywordId: keyword.id,
          language: 'EN',
          slug: spec.slug,
          title: spec.title,
          metaTitle: spec.metaTitle,
          metaDescription: spec.metaDescription,
          schemaMarkup: spec.schemaMarkup,
          status: 'DRAFT',
          publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : undefined,
        },
      });
      this.logger.log(`Created Page ${page.id} (${spec.slug}) for clinic ${payload.name}`);

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
    const site = await this.getClinicSite();
    if (!site) return;

    const slug = `/clinics/${payload.countrySlug ?? payload.countryCode?.toLowerCase() ?? 'unknown'}/${payload.citySlug ?? 'unknown'}/${payload.slug}`;
    const page = await this.prisma.page.findFirst({ where: { siteId: site.id, slug } });
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

  private async getClinicSite(): Promise<{ id: number; domain: string } | null> {
    const clinicDomain = process.env.CLINIC_SITE_DOMAIN ?? DEFAULT_CLINIC_SITE_DOMAIN;
    const site = await this.prisma.site.findUnique({
      where: { domain: clinicDomain },
      select: { id: true, domain: true },
    });

    if (!site) {
      this.logger.warn(`Clinic site domain ${clinicDomain} not found — cannot upsert clinic pages`);
      return null;
    }

    return site;
  }
}
