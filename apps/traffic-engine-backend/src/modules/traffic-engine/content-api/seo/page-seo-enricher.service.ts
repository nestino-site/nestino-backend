import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { slugify } from '../catalog/slug.util';
import {
  buildAffectedPaths,
  inferPageTypeFromSlug,
  MedCoverPageType,
  PageEntities,
} from './page-type.util';
import { SeoSchemaBuilderService } from './seo-schema-builder.service';

export interface PageSeoEnrichInput {
  slug: string;
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  siteDomain: string;
  interviewCount?: number;
  sampleSize?: number;
  googleRating?: number;
  googleReviewCount?: number;
  faq?: Array<{ question: string; answer: string }>;
  heroAnswer?: string;
  clinicUrls?: string[];
}

@Injectable()
export class PageSeoEnricherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schemaBuilder: SeoSchemaBuilderService,
  ) {}

  async enrich(input: PageSeoEnrichInput) {
    const treatmentSlugs = await this.loadTreatmentSlugSet();
    const { pageType, entities } = inferPageTypeFromSlug(input.slug, treatmentSlugs);
    const canonical = this.buildCanonical(input.siteDomain, input.slug);
    const robotsMeta = this.resolveRobotsMeta(input.slug, pageType, {
      interviewCount: input.interviewCount,
      sampleSize: input.sampleSize,
    });

    const metaTitle = input.metaTitle ?? input.title;
    const metaDescription = input.metaDescription ?? '';
    const faq = input.faq ?? [];

    const schemaMarkup = this.schemaBuilder.build({
      pageType,
      title: metaTitle,
      canonical,
      entities,
      faq,
      clinicUrls: input.clinicUrls,
      rating:
        input.googleRating != null
          ? { value: input.googleRating, count: input.googleReviewCount ?? 0 }
          : undefined,
    });

    const breadcrumbs = this.buildBreadcrumbs(input.siteDomain, input.slug, input.title, entities);
    const contentBlocks = input.heroAnswer
      ? [{ id: 'hero-answer', type: 'hero_answer' as const, data: { text: input.heroAnswer } }]
      : [];

    return {
      pageType,
      entities: entities as Prisma.InputJsonValue,
      robotsMeta,
      metaTitle,
      metaDescription,
      schemaMarkup: schemaMarkup as Prisma.InputJsonValue,
      breadcrumbs: breadcrumbs as Prisma.InputJsonValue,
      contentBlocks: contentBlocks as Prisma.InputJsonValue,
      faq: faq.length ? (faq as Prisma.InputJsonValue) : Prisma.JsonNull,
      affectedPaths: buildAffectedPaths(input.slug, pageType),
    };
  }

  validateIndexableSeo(page: {
    metaTitle?: string | null;
    metaDescription?: string | null;
    schemaMarkup?: unknown;
    robotsMeta?: string | null;
  }): string | null {
    if (page.robotsMeta?.includes('noindex')) return null;
    if (!page.metaTitle?.trim()) return 'metaTitle is required for indexable pages';
    if (!page.metaDescription?.trim()) return 'metaDescription is required for indexable pages';
    if (!page.schemaMarkup) return 'schemaMarkup is required for indexable pages';
    return null;
  }

  private resolveRobotsMeta(
    slug: string,
    pageType: MedCoverPageType,
    ctx: { interviewCount?: number; sampleSize?: number },
  ): string {
    if (slug.startsWith('/start')) return 'noindex, follow';
    if (pageType === 'clinic_pdp' && (ctx.interviewCount ?? 0) < 5) {
      return 'noindex, follow';
    }
    if (pageType === 'cost_city' && ctx.sampleSize === 0) {
      return 'noindex, follow';
    }
    return 'index, follow';
  }

  private buildCanonical(domain: string, slug: string): string {
    const base = domain.startsWith('http') ? domain.replace(/\/$/, '') : `https://${domain.replace(/\/$/, '')}`;
    const path = slug.startsWith('/') ? slug : `/${slug}`;
    return path.endsWith('/') ? `${base}${path}` : `${base}${path}/`;
  }

  private buildBreadcrumbs(
    domain: string,
    slug: string,
    title: string,
    _entities: PageEntities,
  ) {
    const base = domain.startsWith('http') ? domain.replace(/\/$/, '') : `https://${domain.replace(/\/$/, '')}`;
    const crumbs: Array<{ name: string; slug: string; position: number }> = [
      { name: 'Home', slug: `${base}/`, position: 1 },
    ];
    const parts = slug.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean);
    let accumulated = '';
    for (let i = 0; i < parts.length; i++) {
      accumulated += `/${parts[i]}`;
      const isLast = i === parts.length - 1;
      crumbs.push({
        name: isLast ? title : parts[i].replace(/-/g, ' '),
        slug: `${base}${accumulated}/`,
        position: i + 2,
      });
    }
    return crumbs;
  }

  private async loadTreatmentSlugSet(): Promise<Set<string>> {
    const treatments = await this.prisma.treatment.findMany({
      where: { isActive: true },
      select: { name: true, code: true },
    });
    return new Set(treatments.flatMap((t) => [slugify(t.name), slugify(t.code)]));
  }
}
