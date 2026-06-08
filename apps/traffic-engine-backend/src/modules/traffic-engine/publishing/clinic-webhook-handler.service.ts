import { Injectable, Logger } from '@nestjs/common';
import { PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ClinicListItem,
  ClinicPageContentBuilder,
} from './clinic-page-content.builder';
import { PublishService } from './publish.service';

export interface ClinicPublishedWebhookPayload {
  event?: 'CLINIC_PUBLISHED' | 'CLINIC_UPDATED' | 'TRUTH_SCORE_CHANGED';
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

const CLINIC_LIST_INCLUDE = {
  city: { include: { country: true } },
  country: true,
  media: { where: { isPrimary: true }, take: 1, select: { url: true } },
  treatments: {
    where: { isOffered: true },
    include: { treatment: { select: { code: true, name: true } } },
  },
  truthScore: { select: { composite: true, grade: true } },
} as const;

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

function treatmentCodeFromSlug(treatmentSlug: string): string {
  return treatmentSlug.toUpperCase().replace(/-/g, '_');
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

  const seenTreatmentSlugs = new Set<string>();
  for (const treatment of treatments) {
    const treatmentSlug = slugify(treatment);
    if (seenTreatmentSlugs.has(treatmentSlug)) continue;
    seenTreatmentSlugs.add(treatmentSlug);

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

@Injectable()
export class ClinicWebhookHandlerService {
  private readonly logger = new Logger(ClinicWebhookHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentBuilder: ClinicPageContentBuilder,
    private readonly publishService: PublishService,
  ) {}

  async handleEvent(
    event: string,
    payload: ClinicPublishedWebhookPayload,
  ): Promise<void> {
    this.logger.log(`Processing clinic event: ${event} for clinic ${payload.clinicId}`);

    if (event === 'CLINIC_PUBLISHED' || event === 'CLINIC_UPDATED') {
      await this.upsertClinicPage(payload);
    } else if (event === 'TRUTH_SCORE_CHANGED') {
      await this.updatePageSchema(payload);
    }
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
    }

    await this.buildAndPublishPage(page.id, spec, payload, existingPage?.finalContent ?? null);
  }

  private async buildAndPublishPage(
    pageId: number,
    spec: ClinicPageSpec,
    payload: ClinicPublishedWebhookPayload,
    existingContent: string | null,
  ): Promise<void> {
    try {
      const parts = spec.slug.split('/').filter(Boolean);
      const isDetailPage = parts.length >= 4;

      let finalContent: string;
      if (isDetailPage) {
        const clinic = await this.prisma.clinic.findUnique({
          where: { id: payload.clinicId },
          include: {
            city: { include: { country: true } },
            country: true,
            treatments: {
              where: { isOffered: true },
              include: { treatment: true },
            },
            doctors: { where: { isActive: true }, orderBy: { name: 'asc' } },
          },
        });

        if (!clinic) {
          this.logger.warn(`Clinic ${payload.clinicId} not found — skipping page ${pageId}`);
          return;
        }

        finalContent = this.contentBuilder.buildDetailContent(clinic);
      } else {
        const clinics = await this.getClinicsByScope(spec.slug, payload);
        finalContent = this.contentBuilder.buildListingContent(spec.slug, existingContent, clinics);
      }

      await this.prisma.page.update({
        where: { id: pageId },
        data: {
          finalContent,
          rawDraft: finalContent,
          pipelineStatus: PipelineStatus.READY,
        },
      });

      const result = await this.publishService.publishPage(pageId);
      if (result.published) {
        this.logger.log(`Published page ${pageId} (${spec.slug})`);
      } else {
        this.logger.warn(
          `Publish skipped for page ${pageId} (${spec.slug}): ${result.skippedReason ?? 'unknown'}`,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to build/publish page ${pageId} (${spec.slug}): ${String(err)}`);
    }
  }

  private async getClinicsByScope(
    slug: string,
    payload: ClinicPublishedWebhookPayload,
  ): Promise<ClinicListItem[]> {
    const parts = slug.split('/').filter(Boolean);
    const publishedWhere = { status: 'PUBLISHED' as const };

    if (parts[1] === 'treatment') {
      const treatmentSlug = parts[2] ?? 'ivf';
      const treatmentCode = treatmentCodeFromSlug(treatmentSlug);
      return this.prisma.clinic.findMany({
        where: {
          ...publishedWhere,
          treatments: {
            some: {
              isOffered: true,
              treatment: { code: treatmentCode },
            },
          },
        },
        include: CLINIC_LIST_INCLUDE,
        orderBy: [{ googleRating: 'desc' }, { name: 'asc' }],
      });
    }

    if (parts.length === 3) {
      const citySlug = parts[2];
      return this.prisma.clinic.findMany({
        where: {
          ...publishedWhere,
          city: { slug: citySlug },
        },
        include: CLINIC_LIST_INCLUDE,
        orderBy: [{ googleRating: 'desc' }, { name: 'asc' }],
      });
    }

    const countrySlug = parts[1] ?? payload.countrySlug ?? 'unknown';
    const countries = await this.prisma.country.findMany({
      select: { id: true, name: true, codeIso2: true },
    });
    const country = countries.find((c) => slugify(c.name) === countrySlug);
    if (!country) {
      this.logger.warn(`No country matched slug ${countrySlug} for listing ${slug}`);
      return [];
    }

    return this.prisma.clinic.findMany({
      where: {
        ...publishedWhere,
        OR: [{ countryId: country.id }, { city: { countryId: country.id } }],
      },
      include: CLINIC_LIST_INCLUDE,
      orderBy: [{ googleRating: 'desc' }, { name: 'asc' }],
    });
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
