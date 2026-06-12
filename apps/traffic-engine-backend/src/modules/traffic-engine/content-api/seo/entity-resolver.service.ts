import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { slugify } from '../catalog/slug.util';
import { MedCoverPageType, PageEntities } from './page-type.util';

interface TaxonomyMaps {
  countriesBySlug: Map<string, { slug: string; name: string }>;
  citiesBySlug: Map<string, { slug: string; name: string; countrySlug: string }>;
  treatmentsBySlug: Map<string, { slug: string; name: string }>;
}

@Injectable()
export class EntityResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(inferred: {
    pageType: MedCoverPageType;
    entities: PageEntities;
  }): Promise<{ pageType: MedCoverPageType; entities: PageEntities }> {
    const maps = await this.loadTaxonomyMaps();
    return {
      pageType: inferred.pageType,
      entities: resolveEntitiesAgainstMaps(inferred.entities, maps),
    };
  }

  private async loadTaxonomyMaps(): Promise<TaxonomyMaps> {
    const [countries, treatments] = await Promise.all([
      this.prisma.country.findMany({
        select: {
          name: true,
          cities: { select: { slug: true, name: true } },
        },
      }),
      this.prisma.treatment.findMany({
        where: { isActive: true },
        select: { name: true, code: true },
      }),
    ]);

    const countriesBySlug = new Map<string, { slug: string; name: string }>();
    const citiesBySlug = new Map<
      string,
      { slug: string; name: string; countrySlug: string }
    >();

    for (const country of countries) {
      const countrySlug = slugify(country.name);
      countriesBySlug.set(countrySlug, { slug: countrySlug, name: country.name });
      for (const city of country.cities) {
        citiesBySlug.set(city.slug, {
          slug: city.slug,
          name: city.name,
          countrySlug,
        });
      }
    }

    const treatmentsBySlug = new Map<string, { slug: string; name: string }>();
    for (const treatment of treatments) {
      const canonicalSlug = slugify(treatment.name);
      const entry = { slug: canonicalSlug, name: treatment.name };
      treatmentsBySlug.set(canonicalSlug, entry);
      treatmentsBySlug.set(slugify(treatment.code), entry);
      treatmentsBySlug.set(treatment.code.toLowerCase(), entry);
    }

    return { countriesBySlug, citiesBySlug, treatmentsBySlug };
  }
}

/** Pure resolver for unit tests and backfill scripts. */
export function resolveEntitiesAgainstMaps(
  raw: PageEntities,
  maps: TaxonomyMaps,
): PageEntities {
  const entities: PageEntities = {};

  if (raw.country) {
    const country = maps.countriesBySlug.get(raw.country.slug);
    if (country) entities.country = country;
  }

  if (raw.city) {
    const city = maps.citiesBySlug.get(raw.city.slug);
    if (city && (!entities.country || city.countrySlug === entities.country.slug)) {
      entities.city = { slug: city.slug, name: city.name };
      if (!entities.country) {
        const parent = maps.countriesBySlug.get(city.countrySlug);
        if (parent) entities.country = parent;
      }
    }
  }

  if (raw.treatment) {
    const treatment = maps.treatmentsBySlug.get(raw.treatment.slug);
    if (treatment) entities.treatment = treatment;
  }

  if (raw.clinics?.length) {
    const clinics = raw.clinics
      .filter((c) => c.slug && c.urlPath)
      .map((c) => ({
        slug: c.slug,
        name: c.name || c.slug,
        urlPath: c.urlPath,
      }));
    if (clinics.length > 0) entities.clinics = clinics;
  }

  return entities;
}
