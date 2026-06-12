import { Injectable, Logger } from '@nestjs/common';
import { PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  displayNameFromSlug,
  isTreatmentSlug,
  slugify,
  treatmentCodeFromSlug,
} from '../content-api/catalog/slug.util';
import { PageSeoEnricherService } from '../content-api/seo/page-seo-enricher.service';
import {
  ClinicListItem,
  ClinicPageContentBuilder,
} from './clinic-page-content.builder';
import { ClinicPhotoCdnService } from './clinic-photo-cdn.service';
import { PublishService } from './publish.service';
import { resolveClinicPhotoDisplayUrl } from '../../clinic-inventory/clinics/utils/clinic-photo.util';

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

const CLINIC_LIST_SELECT = {
  id: true,
  slug: true,
  name: true,
  phone: true,
  formattedPhone: true,
  websiteUrl: true,
  addressLine: true,
  googleRating: true,
  googleReviewCount: true,
  editorialSummary: true,
  googleMapsUrl: true,
  heroImageUrl: true,
  googlePhotos: true,
  city: { select: { slug: true, name: true, country: { select: { name: true, codeIso2: true } } } },
  country: { select: { name: true, codeIso2: true } },
  media: { where: { isPrimary: true }, take: 1, select: { url: true } },
  treatments: {
    where: { isOffered: true },
    select: {
      isOffered: true,
      treatment: { select: { code: true, name: true } },
    },
  },
  truthScore: { select: { composite: true, grade: true } },
} as const;

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
    specs.push(
      {
        slug: `/clinics/${countrySlug}/${treatmentSlug}`,
        keyword: `${treatmentName} clinics ${countryName}`,
        title: `${treatmentName} Clinics in ${countryName}`,
        metaTitle: `${treatmentName} Clinics in ${countryName} - Verified Directory`,
        metaDescription: `Find ${treatmentName} clinics in ${countryName} with verified patient interviews, Google data and transparent profiles.`,
        priority: 3,
        schemaMarkup: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${treatmentName} Clinics in ${countryName}`,
        },
      },
      {
        slug: `/clinics/${countrySlug}/${citySlug}/${treatmentSlug}`,
        keyword: `${treatmentName} clinics ${cityName}`,
        title: `${treatmentName} Clinics in ${cityName}`,
        metaTitle: `${treatmentName} Clinics in ${cityName} - Verified Directory`,
        metaDescription: `Compare ${treatmentName} clinics in ${cityName} using verified patient data and transparent pricing.`,
        priority: 3,
        schemaMarkup: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${treatmentName} Clinics in ${cityName}`,
        },
      },
    );
  }

  return specs;
}

@Injectable()
export class ClinicWebhookHandlerService {
  private readonly logger = new Logger(ClinicWebhookHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentBuilder: ClinicPageContentBuilder,
    private readonly clinicPhotoCdn: ClinicPhotoCdnService,
    private readonly publishService: PublishService,
    private readonly pageSeoEnricher: PageSeoEnricherService,
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

    const site = await this.prisma.site.findUnique({
      where: { id: clinicSiteId },
      select: { domain: true },
    });
    const specParts = spec.slug.split('/').filter(Boolean);
    const treatmentSlugSetForSeo = await this.loadTreatmentSlugSet();
    const isPdpSpec =
      specParts.length === 4 &&
      specParts[0] === 'clinics' &&
      !isTreatmentSlug(specParts[3], treatmentSlugSetForSeo);
    let interviewCount: number | undefined;
    if (isPdpSpec) {
      const score = await this.prisma.clinicTruthScore.findUnique({
        where: { clinicId: payload.clinicId },
        select: { interviewCount: true },
      });
      interviewCount = score?.interviewCount;
    }

    const seo = await this.pageSeoEnricher.enrich({
      slug: spec.slug,
      title: spec.title,
      metaTitle: spec.metaTitle,
      metaDescription: spec.metaDescription,
      siteDomain: site?.domain ?? DEFAULT_CLINIC_SITE_DOMAIN,
      interviewCount,
      googleRating: payload.googleRating,
      googleReviewCount: payload.googleReviewCount,
      heroAnswer: spec.metaDescription,
    });

    let page;
    if (existingPage) {
      page = await this.prisma.page.update({
        where: { id: existingPage.id },
        data: {
          title: spec.title,
          metaTitle: seo.metaTitle,
          metaDescription: seo.metaDescription,
          schemaMarkup: seo.schemaMarkup,
          pageType: seo.pageType,
          entities: seo.entities,
          contentBlocks: seo.contentBlocks,
          breadcrumbs: seo.breadcrumbs,
          robotsMeta: seo.robotsMeta,
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
          metaTitle: seo.metaTitle,
          metaDescription: seo.metaDescription,
          schemaMarkup: seo.schemaMarkup,
          pageType: seo.pageType,
          entities: seo.entities,
          contentBlocks: seo.contentBlocks,
          breadcrumbs: seo.breadcrumbs,
          robotsMeta: seo.robotsMeta,
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
      const treatmentSlugSet = await this.loadTreatmentSlugSet();
      const isDetailPage =
        parts.length === 4 && parts[0] === 'clinics' && !isTreatmentSlug(parts[3], treatmentSlugSet);

      let finalContent: string;
      if (isDetailPage) {
        await this.clinicPhotoCdn.ensureClinicPhotoOnCdn(payload.clinicId);

        const clinic = await this.prisma.clinic.findUnique({
          where: { id: payload.clinicId },
          select: {
            id: true,
            slug: true,
            name: true,
            phone: true,
            formattedPhone: true,
            websiteUrl: true,
            addressLine: true,
            googleRating: true,
            googleReviewCount: true,
            editorialSummary: true,
            googleMapsUrl: true,
            heroImageUrl: true,
            googlePhotos: true,
            googleReviews: true,
            openingHours: true,
            shortDescription: true,
            longDescription: true,
            city: { select: { slug: true, name: true, country: { select: { name: true, codeIso2: true } } } },
            country: { select: { name: true, codeIso2: true } },
            media: { where: { isPrimary: true }, take: 1, select: { url: true } },
            treatments: {
              where: { isOffered: true },
              select: { isOffered: true, treatment: { select: { code: true, name: true } } },
            },
            doctors: {
              where: { isActive: true },
              orderBy: { name: 'asc' },
              select: { name: true, title: true, specialties: true },
            },
          },
        });

        if (!clinic) {
          this.logger.warn(`Clinic ${payload.clinicId} not found — skipping page ${pageId}`);
          return;
        }

        finalContent = this.contentBuilder.buildDetailContent(clinic);

        const clinicPhotoUrl = resolveClinicPhotoDisplayUrl(clinic);
        await this.prisma.page.update({
          where: { id: pageId },
          data: {
            finalContent,
            rawDraft: finalContent,
            pipelineStatus: PipelineStatus.READY,
            generatedImageBase64: null,
            imagePrompt: null,
            generatedImageCdnUrl: clinicPhotoUrl,
          },
        });
      } else {
        let clinics = await this.getClinicsByScope(spec.slug, payload);
        await this.clinicPhotoCdn.ensurePhotosForClinics(clinics.map((c) => c.id));
        clinics = await this.getClinicsByScope(spec.slug, payload);
        finalContent = this.contentBuilder.buildListingContent(spec.slug, existingContent, clinics);

        await this.prisma.page.update({
          where: { id: pageId },
          data: {
            finalContent,
            rawDraft: finalContent,
            pipelineStatus: PipelineStatus.READY,
          },
        });
      }

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
    const treatmentSlugSet = await this.loadTreatmentSlugSet();

    if (parts.length === 4 && isTreatmentSlug(parts[3], treatmentSlugSet)) {
      const countrySlug = parts[1];
      const citySlug = parts[2];
      const treatmentCode = treatmentCodeFromSlug(parts[3]);
      const country = await this.resolveCountryBySlug(countrySlug);
      if (!country) return [];
      return this.prisma.clinic.findMany({
        where: {
          ...publishedWhere,
          city: { slug: citySlug, countryId: country.id },
          treatments: {
            some: { isOffered: true, treatment: { code: treatmentCode } },
          },
        },
        select: CLINIC_LIST_SELECT,
        orderBy: [{ googleRating: 'desc' }, { name: 'asc' }],
      });
    }

    if (parts.length === 3 && isTreatmentSlug(parts[2], treatmentSlugSet)) {
      const countrySlug = parts[1];
      const treatmentCode = treatmentCodeFromSlug(parts[2]);
      const country = await this.resolveCountryBySlug(countrySlug);
      if (!country) return [];
      return this.prisma.clinic.findMany({
        where: {
          ...publishedWhere,
          OR: [{ countryId: country.id }, { city: { countryId: country.id } }],
          treatments: {
            some: { isOffered: true, treatment: { code: treatmentCode } },
          },
        },
        select: CLINIC_LIST_SELECT,
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
        select: CLINIC_LIST_SELECT,
        orderBy: [{ googleRating: 'desc' }, { name: 'asc' }],
      });
    }

    const countrySlug = parts[1] ?? payload.countrySlug ?? 'unknown';
    const country = await this.resolveCountryBySlug(countrySlug);
    if (!country) {
      this.logger.warn(`No country matched slug ${countrySlug} for listing ${slug}`);
      return [];
    }

    return this.prisma.clinic.findMany({
      where: {
        ...publishedWhere,
        OR: [{ countryId: country.id }, { city: { countryId: country.id } }],
      },
      select: CLINIC_LIST_SELECT,
      orderBy: [{ googleRating: 'desc' }, { name: 'asc' }],
    });
  }

  private async resolveCountryBySlug(countrySlug: string) {
    const countries = await this.prisma.country.findMany({
      select: { id: true, name: true, codeIso2: true },
    });
    return countries.find((c) => slugify(c.name) === countrySlug) ?? null;
  }

  private async loadTreatmentSlugSet(): Promise<Set<string>> {
    const treatments = await this.prisma.treatment.findMany({
      where: { isActive: true },
      select: { name: true, code: true },
    });
    return new Set(treatments.flatMap((t) => [slugify(t.name), slugify(t.code)]));
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
