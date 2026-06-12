import { Injectable, NotFoundException } from '@nestjs/common';
import { ClinicStatus, PageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  aggregatePriceRange,
  ClinicCard,
  ClinicListRow,
  mapClinicToCard,
} from './clinic-card.mapper';
import { CompareQueryDto } from './dto/compare-query.dto';
import { CostsQueryDto } from './dto/costs-query.dto';
import { ListClinicsQueryDto } from './dto/list-clinics-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  countryFlagEmoji,
  isTreatmentSlug,
  slugify,
  treatmentCodeFromSlug,
} from './slug.util';

const DEFAULT_CLINIC_SITE_DOMAIN = 'medcover.io';

const CLINIC_LIST_SELECT = {
  id: true,
  slug: true,
  name: true,
  googleRating: true,
  googleReviewCount: true,
  editorialSummary: true,
  heroImageUrl: true,
  googlePhotos: true,
  city: {
    select: {
      slug: true,
      name: true,
      country: { select: { name: true, codeIso2: true } },
    },
  },
  country: { select: { name: true, codeIso2: true } },
  media: { where: { isPrimary: true }, take: 1, select: { url: true } },
  treatments: {
    where: { isOffered: true },
    select: { isOffered: true, treatment: { select: { code: true, name: true } } },
  },
  truthScore: {
    select: { composite: true, grade: true, status: true, interviewCount: true },
  },
  pricingPackages: {
    where: { isActive: true },
    select: { priceMin: true, priceMax: true, currency: true, isActive: true },
  },
  _count: { select: { interviews: { where: { status: 'PUBLISHED' } } } },
} as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getTaxonomy() {
    const [countries, treatments] = await Promise.all([
      this.prisma.country.findMany({
        include: {
          cities: {
            include: {
              _count: { select: { clinics: { where: { status: ClinicStatus.PUBLISHED } } } },
            },
            orderBy: { name: 'asc' },
          },
          _count: { select: { clinics: { where: { status: ClinicStatus.PUBLISHED } } } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.treatment.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const treatmentCountries = await this.prisma.clinicTreatment.findMany({
      where: {
        isOffered: true,
        clinic: { status: ClinicStatus.PUBLISHED },
      },
      select: {
        treatmentId: true,
        clinic: {
          select: {
            country: { select: { name: true } },
            city: { select: { country: { select: { name: true } } } },
          },
        },
      },
    });

    const countriesByTreatment = new Map<number, Set<string>>();
    for (const row of treatmentCountries) {
      const countryName =
        row.clinic.country?.name ?? row.clinic.city?.country?.name;
      if (!countryName) continue;
      const slug = slugify(countryName);
      if (!countriesByTreatment.has(row.treatmentId)) {
        countriesByTreatment.set(row.treatmentId, new Set());
      }
      countriesByTreatment.get(row.treatmentId)!.add(slug);
    }

    const treatmentClinicCounts = await Promise.all(
      treatments.map(async (t) => {
        const count = await this.prisma.clinic.count({
          where: {
            status: ClinicStatus.PUBLISHED,
            treatments: { some: { treatmentId: t.id, isOffered: true } },
          },
        });
        return { treatmentId: t.id, count };
      }),
    );
    const countMap = new Map(treatmentClinicCounts.map((c) => [c.treatmentId, c.count]));

    return {
      countries: countries.map((c) => ({
        slug: slugify(c.name),
        name: c.name,
        codeIso2: c.codeIso2,
        flagEmoji: countryFlagEmoji(c.codeIso2),
        clinicCount: c._count.clinics,
        cities: c.cities
          .filter((city) => city._count.clinics > 0 || city.isActiveDestination)
          .map((city) => ({
            slug: city.slug,
            name: city.name,
            clinicCount: city._count.clinics,
          })),
      })),
      treatments: treatments.map((t) => ({
        slug: slugify(t.name),
        code: t.code,
        name: t.name,
        clinicCount: countMap.get(t.id) ?? 0,
        countries: Array.from(countriesByTreatment.get(t.id) ?? []),
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  async listClinics(query: ListClinicsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 24, 48);
    const skip = (page - 1) * limit;
    const treatmentSlugSet = await this.loadTreatmentSlugSet();

    const where = await this.buildClinicWhere(query, treatmentSlugSet);
    const orderBy = this.buildClinicOrderBy(query.sort);

    const [total, clinics] = await Promise.all([
      this.prisma.clinic.count({ where }),
      this.prisma.clinic.findMany({
        where,
        select: CLINIC_LIST_SELECT,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    let items = clinics.map((c) => mapClinicToCard(c as ClinicListRow));

    if (query.sort === 'price_asc' || query.sort === 'price_desc') {
      items = this.sortByPrice(items, query.sort);
    }

    return { items, total, page, limit };
  }

  async getClinicPdp(countrySlug: string, citySlug: string, clinicSlug: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { slug: clinicSlug },
      include: {
        city: { include: { country: true } },
        country: true,
        treatments: {
          where: { isOffered: true },
          include: { treatment: true },
        },
        accreditations: { include: { accreditation: true } },
        pricingPackages: {
          where: { isActive: true },
          include: { treatment: true },
          orderBy: { packageName: 'asc' },
        },
        media: { orderBy: { displayOrder: 'asc' } },
        doctors: { where: { isActive: true }, orderBy: { name: 'asc' } },
        truthScore: true,
        interviews: {
          where: { status: 'PUBLISHED', consentGiven: true },
          select: {
            ageBucket: true,
            originCountry: true,
            treatmentCode: true,
            completedYear: true,
            quotes: true,
          },
          orderBy: { publishedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!clinic || clinic.status !== ClinicStatus.PUBLISHED) {
      throw new NotFoundException(`Clinic '${clinicSlug}' not found`);
    }

    const resolvedCountryName = clinic.country?.name ?? clinic.city?.country?.name;
    const resolvedCountrySlug = resolvedCountryName ? slugify(resolvedCountryName) : null;
    const resolvedCitySlug = clinic.city?.slug ?? null;

    if (
      resolvedCountrySlug !== countrySlug.toLowerCase() ||
      resolvedCitySlug !== citySlug.toLowerCase()
    ) {
      throw new NotFoundException(`Clinic '${clinicSlug}' not found`);
    }

    const card = mapClinicToCard(clinic as ClinicListRow);
    const googleReviews = this.parseGoogleReviews(clinic.googleReviews);

    return {
      ...card,
      addressLine: clinic.addressLine,
      phone: clinic.phone ?? clinic.formattedPhone,
      email: clinic.email,
      websiteUrl: clinic.websiteUrl,
      googleMapsUrl: clinic.googleMapsUrl,
      openingHours: clinic.openingHours,
      media: clinic.media.map((m) => ({
        url: m.url,
        caption: m.caption,
        kind: m.kind,
        isPrimary: m.isPrimary,
      })),
      doctors: clinic.doctors.map((d) => ({
        name: d.name,
        title: d.title,
        specialties: d.specialties,
        photoUrl: d.photoUrl,
        profileUrl: d.profileUrl,
      })),
      googleReviews,
      pricingPackages: clinic.pricingPackages.map((p) => ({
        treatmentType: p.treatment?.code ?? null,
        packageName: p.packageName,
        priceMin: p.priceMin != null ? Number(p.priceMin) : null,
        priceMax: p.priceMax != null ? Number(p.priceMax) : null,
        basePrice: p.basePrice != null ? Number(p.basePrice) : null,
        currency: p.currency,
        includes: Array.isArray(p.includes) ? p.includes : [],
        excludes: Array.isArray(p.excludes) ? p.excludes : [],
        notes: p.notes,
        lastVerifiedAt: p.lastVerifiedAt?.toISOString() ?? null,
      })),
      longDescription: clinic.longDescription,
      shortDescription: clinic.shortDescription,
      accreditations: clinic.accreditations.map((a) => ({
        code: a.accreditation.code,
        name: a.accreditation.name,
        regulator: a.accreditation.regulator,
      })),
      interviews: clinic.interviews,
      truthScore: clinic.truthScore
        ? {
            composite: clinic.truthScore.composite,
            grade: clinic.truthScore.grade,
            dimensionScores: clinic.truthScore.dimensionScores ?? {},
            interviewCount: clinic.truthScore.interviewCount,
            lastComputedAt: clinic.truthScore.lastComputedAt?.toISOString() ?? null,
          }
        : null,
      languages: clinic.languages,
      foundedYear: clinic.foundedYear,
      doctorsCount: clinic.doctorsCount,
      inHouseLab: clinic.inHouseLab,
      publishedAt: clinic.publishedAt?.toISOString() ?? null,
      updatedAt: clinic.updatedAt.toISOString(),
    };
  }

  async getCosts(treatmentSlug: string, query: CostsQueryDto) {
    const treatment = await this.findTreatmentBySlug(treatmentSlug);
    if (!treatment) {
      throw new NotFoundException(`Treatment '${treatmentSlug}' not found`);
    }

    const packages = await this.prisma.clinicPricingPackage.findMany({
      where: {
        isActive: true,
        treatmentId: treatment.id,
        clinic: {
          status: ClinicStatus.PUBLISHED,
          ...(query.country
            ? {
                OR: [
                  { country: { name: { mode: 'insensitive', equals: this.unslugify(query.country) } } },
                  { city: { country: { name: { mode: 'insensitive', equals: this.unslugify(query.country) } } } },
                ],
              }
            : {}),
          ...(query.city ? { city: { slug: query.city } } : {}),
        },
      },
      include: {
        clinic: {
          select: {
            slug: true,
            name: true,
            city: { select: { slug: true, name: true, country: { select: { name: true } } } },
            country: { select: { name: true } },
          },
        },
      },
    });

    const prices = packages
      .map((p) => ({
        min: p.priceMin != null ? Number(p.priceMin) : null,
        max: p.priceMax != null ? Number(p.priceMax) : null,
        currency: p.currency,
        clinic: p.clinic,
      }))
      .filter((p) => p.min != null || p.max != null);

    const sampleSize = prices.length;
    const overall =
      sampleSize === 0
        ? null
        : this.aggregatePrices(prices.map((p) => ({ min: p.min, max: p.max, currency: p.currency })));

    const byCountryMap = new Map<
      string,
      { country: { slug: string; name: string }; prices: typeof prices }
    >();
    for (const row of prices) {
      const countryName =
        row.clinic.country?.name ?? row.clinic.city?.country?.name ?? 'Unknown';
      const slug = slugify(countryName);
      if (!byCountryMap.has(slug)) {
        byCountryMap.set(slug, {
          country: { slug, name: countryName },
          prices: [],
        });
      }
      byCountryMap.get(slug)!.prices.push(row);
    }

    const byCityMap = new Map<
      string,
      {
        city: { slug: string; name: string };
        country: { slug: string; name: string };
        prices: typeof prices;
      }
    >();
    for (const row of prices) {
      const citySlug = row.clinic.city?.slug;
      const cityName = row.clinic.city?.name;
      const countryName =
        row.clinic.country?.name ?? row.clinic.city?.country?.name ?? 'Unknown';
      if (!citySlug || !cityName) continue;
      const key = `${slugify(countryName)}/${citySlug}`;
      if (!byCityMap.has(key)) {
        byCityMap.set(key, {
          city: { slug: citySlug, name: cityName },
          country: { slug: slugify(countryName), name: countryName },
          prices: [],
        });
      }
      byCityMap.get(key)!.prices.push(row);
    }

    const topClinics = packages
      .slice(0, 5)
      .map((p) => {
        const countryName =
          p.clinic.country?.name ?? p.clinic.city?.country?.name ?? 'unknown';
        const citySlug = p.clinic.city?.slug ?? 'unknown';
        return {
          slug: p.clinic.slug,
          name: p.clinic.name,
          urlPath: `/clinics/${slugify(countryName)}/${citySlug}/${p.clinic.slug}/`,
          priceRange: {
            min: p.priceMin != null ? Number(p.priceMin) : 0,
            max: p.priceMax != null ? Number(p.priceMax) : 0,
            currency: p.currency,
          },
        };
      });

    return {
      treatment: { slug: slugify(treatment.name), name: treatment.name },
      overall: overall
        ? { ...overall, sampleSize, updatedAt: new Date().toISOString() }
        : null,
      byCountry: [...byCountryMap.values()].map((g) => {
        const agg = this.aggregatePrices(
          g.prices.map((p) => ({ min: p.min, max: p.max, currency: p.currency })),
        )!;
        return {
          country: g.country,
          ...agg,
          clinicCount: g.prices.length,
        };
      }),
      byCity: [...byCityMap.values()].map((g) => {
        const agg = this.aggregatePrices(
          g.prices.map((p) => ({ min: p.min, max: p.max, currency: p.currency })),
        )!;
        return {
          city: g.city,
          country: g.country,
          ...agg,
          clinicCount: g.prices.length,
        };
      }),
      topClinics,
    };
  }

  async search(siteId: number, query: SearchQueryDto) {
    const limit = query.limit ?? 10;
    const q = query.q?.trim() ?? '';

    if (q.length < 2) {
      const suggestions = await this.getSearchSuggestions(limit);
      return {
        clinics: [],
        treatments: [],
        countries: [],
        cities: [],
        guides: [],
        suggestions,
      };
    }

    const [clinics, treatments, countries, cities, guides] = await Promise.all([
      this.prisma.clinic.findMany({
        where: { status: ClinicStatus.PUBLISHED, name: { contains: q, mode: 'insensitive' } },
        select: CLINIC_LIST_SELECT,
        take: limit,
        orderBy: { googleRating: 'desc' },
      }),
      this.prisma.treatment.findMany({
        where: { isActive: true, name: { contains: q, mode: 'insensitive' } },
        take: limit,
      }),
      this.prisma.country.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        take: limit,
        include: { _count: { select: { clinics: { where: { status: ClinicStatus.PUBLISHED } } } } },
      }),
      this.prisma.city.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        take: limit,
        include: {
          country: { select: { name: true } },
          _count: { select: { clinics: { where: { status: ClinicStatus.PUBLISHED } } } },
        },
      }),
      this.prisma.page.findMany({
        where: {
          siteId,
          status: PageStatus.PUBLISHED,
          slug: { startsWith: '/guides/' },
          title: { contains: q, mode: 'insensitive' },
        },
        select: { slug: true, title: true, metaDescription: true },
        take: limit,
      }),
    ]);

    return {
      clinics: clinics.map((c) => mapClinicToCard(c as ClinicListRow)),
      treatments: await Promise.all(
        treatments.map(async (t) => ({
          slug: slugify(t.name),
          name: t.name,
          clinicCount: await this.prisma.clinic.count({
            where: {
              status: ClinicStatus.PUBLISHED,
              treatments: { some: { treatmentId: t.id, isOffered: true } },
            },
          }),
        })),
      ),
      countries: countries.map((c) => ({
        slug: slugify(c.name),
        name: c.name,
        clinicCount: c._count.clinics,
      })),
      cities: cities.map((c) => ({
        slug: c.slug,
        name: c.name,
        country: slugify(c.country.name),
        clinicCount: c._count.clinics,
      })),
      guides: guides.map((g) => ({
        slug: g.slug.endsWith('/') ? g.slug : `${g.slug}/`,
        title: g.title ?? '',
        description: g.metaDescription ?? '',
      })),
      suggestions: await this.getSearchSuggestions(limit),
    };
  }

  async compare(query: CompareQueryDto) {
    if (query.type === 'clinic') {
      return this.compareClinics(query.a, query.b);
    }
    if (query.type === 'city') {
      if (!query.treatment) {
        throw new NotFoundException('treatment query param required for city compare');
      }
      return this.compareCities(query.a, query.b, query.treatment);
    }
    if (!query.treatment) {
      throw new NotFoundException('treatment query param required for country compare');
    }
    return this.compareCountries(query.a, query.b, query.treatment);
  }

  private async compareClinics(slugA: string, slugB: string) {
    const [a, b] = await Promise.all([
      this.prisma.clinic.findUnique({
        where: { slug: slugA },
        include: {
          city: { include: { country: true } },
          country: true,
          truthScore: true,
          treatments: { where: { isOffered: true }, include: { treatment: true } },
          pricingPackages: { where: { isActive: true } },
          media: { where: { isPrimary: true }, take: 1 },
        },
      }),
      this.prisma.clinic.findUnique({
        where: { slug: slugB },
        include: {
          city: { include: { country: true } },
          country: true,
          truthScore: true,
          treatments: { where: { isOffered: true }, include: { treatment: true } },
          pricingPackages: { where: { isActive: true } },
          media: { where: { isPrimary: true }, take: 1 },
        },
      }),
    ]);

    if (!a || a.status !== ClinicStatus.PUBLISHED) {
      throw new NotFoundException(`Clinic '${slugA}' not found`);
    }
    if (!b || b.status !== ClinicStatus.PUBLISHED) {
      throw new NotFoundException(`Clinic '${slugB}' not found`);
    }

    const toEntity = (clinic: typeof a) => ({
      ...mapClinicToCard(clinic as ClinicListRow),
      dimensionScores: clinic.truthScore?.dimensionScores ?? {},
    });

    return {
      type: 'clinic' as const,
      treatment: null,
      entityA: toEntity(a),
      entityB: toEntity(b),
    };
  }

  private async compareCities(citySlugA: string, citySlugB: string, treatmentSlug: string) {
    const treatment = await this.findTreatmentBySlug(treatmentSlug);
    if (!treatment) throw new NotFoundException(`Treatment '${treatmentSlug}' not found`);

    const [cityA, cityB] = await Promise.all([
      this.prisma.city.findUnique({
        where: { slug: citySlugA },
        include: { country: true },
      }),
      this.prisma.city.findUnique({
        where: { slug: citySlugB },
        include: { country: true },
      }),
    ]);

    if (!cityA) throw new NotFoundException(`City '${citySlugA}' not found`);
    if (!cityB) throw new NotFoundException(`City '${citySlugB}' not found`);

    const [entityA, entityB] = await Promise.all([
      this.buildGeoCompareEntity('city', cityA.name, cityA.slug, cityA.id, treatment.id),
      this.buildGeoCompareEntity('city', cityB.name, cityB.slug, cityB.id, treatment.id),
    ]);

    return {
      type: 'city' as const,
      treatment: { slug: slugify(treatment.name), name: treatment.name },
      entityA,
      entityB,
    };
  }

  private async compareCountries(
    countrySlugA: string,
    countrySlugB: string,
    treatmentSlug: string,
  ) {
    const treatment = await this.findTreatmentBySlug(treatmentSlug);
    if (!treatment) throw new NotFoundException(`Treatment '${treatmentSlug}' not found`);

    const countries = await this.prisma.country.findMany();
    const countryA = countries.find((c) => slugify(c.name) === countrySlugA.toLowerCase());
    const countryB = countries.find((c) => slugify(c.name) === countrySlugB.toLowerCase());

    if (!countryA) throw new NotFoundException(`Country '${countrySlugA}' not found`);
    if (!countryB) throw new NotFoundException(`Country '${countrySlugB}' not found`);

    const [entityA, entityB] = await Promise.all([
      this.buildGeoCompareEntity('country', countryA.name, slugify(countryA.name), countryA.id, treatment.id),
      this.buildGeoCompareEntity('country', countryB.name, slugify(countryB.name), countryB.id, treatment.id),
    ]);

    return {
      type: 'country' as const,
      treatment: { slug: slugify(treatment.name), name: treatment.name },
      entityA,
      entityB,
    };
  }

  private async buildGeoCompareEntity(
    scope: 'city' | 'country',
    name: string,
    slug: string,
    entityId: number,
    treatmentId: number,
  ) {
    const where: Prisma.ClinicWhereInput = {
      status: ClinicStatus.PUBLISHED,
      treatments: { some: { treatmentId, isOffered: true } },
      ...(scope === 'city' ? { cityId: entityId } : { OR: [{ countryId: entityId }, { city: { countryId: entityId } }] }),
    };

    const clinics = await this.prisma.clinic.findMany({
      where,
      select: CLINIC_LIST_SELECT,
      orderBy: { googleRating: 'desc' },
      take: 5,
    });

    const clinicCount = await this.prisma.clinic.count({ where });

    const ratings = clinics
      .map((c) => (c.googleRating != null ? Number(c.googleRating) : null))
      .filter((r): r is number => r != null);
    const avgRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    const truthScores = clinics
      .map((c) => c.truthScore?.composite)
      .filter((s): s is number => s != null);
    const truthScoreAvg =
      truthScores.length > 0
        ? Math.round(truthScores.reduce((a, b) => a + b, 0) / truthScores.length)
        : null;

    const allPrices = clinics.flatMap((c) =>
      (c.pricingPackages ?? []).map((p) => ({
        min: p.priceMin != null ? Number(p.priceMin) : null,
        max: p.priceMax != null ? Number(p.priceMax) : null,
        currency: p.currency,
      })),
    );
    const priceRange = this.aggregatePrices(allPrices);

    return {
      name,
      slug,
      clinicCount,
      avgRating,
      priceRange,
      truthScoreAvg,
      topClinics: clinics.map((c) => mapClinicToCard(c as ClinicListRow)),
    };
  }

  private async buildClinicWhere(
    query: ListClinicsQueryDto,
    treatmentSlugSet: Set<string>,
  ): Promise<Prisma.ClinicWhereInput> {
    const where: Prisma.ClinicWhereInput = { status: ClinicStatus.PUBLISHED };

    if (query.country) {
      const countries = await this.prisma.country.findMany();
      const country = countries.find((c) => slugify(c.name) === query.country!.toLowerCase());
      if (country) {
        where.OR = [{ countryId: country.id }, { city: { countryId: country.id } }];
      } else {
        where.id = -1;
      }
    }

    if (query.city) {
      where.city = { slug: query.city };
    }

    if (query.treatment) {
      const code = treatmentCodeFromSlug(query.treatment);
      where.treatments = {
        some: { isOffered: true, treatment: { code } },
      };
    }

    if (query.minRating != null) {
      where.googleRating = { gte: query.minRating };
    }

    if (query.minTruthScore != null) {
      where.truthScore = {
        composite: { gte: query.minTruthScore },
        status: 'LIVE',
      };
    }

    if (query.country && query.city && !query.treatment) {
      const parts = [query.country, query.city];
      if (parts.some((p) => isTreatmentSlug(p, treatmentSlugSet))) {
        // disambiguation handled by explicit treatment param
      }
    }

    return where;
  }

  private buildClinicOrderBy(
    sort?: ListClinicsQueryDto['sort'],
  ): Prisma.ClinicOrderByWithRelationInput[] {
    switch (sort) {
      case 'name':
        return [{ name: 'asc' }];
      case 'truth_score':
        return [{ truthScore: { composite: 'desc' } }, { name: 'asc' }];
      case 'price_asc':
      case 'price_desc':
        return [{ googleRating: 'desc' }, { name: 'asc' }];
      case 'rating':
      default:
        return [{ googleRating: 'desc' }, { name: 'asc' }];
    }
  }

  private sortByPrice(items: ClinicCard[], sort: 'price_asc' | 'price_desc') {
    return [...items].sort((a, b) => {
      const aMin = a.priceRange?.min ?? Number.MAX_SAFE_INTEGER;
      const bMin = b.priceRange?.min ?? Number.MAX_SAFE_INTEGER;
      return sort === 'price_asc' ? aMin - bMin : bMin - aMin;
    });
  }

  private async loadTreatmentSlugSet(): Promise<Set<string>> {
    const treatments = await this.prisma.treatment.findMany({
      where: { isActive: true },
      select: { name: true, code: true },
    });
    return new Set(treatments.flatMap((t) => [slugify(t.name), slugify(t.code)]));
  }

  private async findTreatmentBySlug(treatmentSlug: string) {
    const treatments = await this.prisma.treatment.findMany({ where: { isActive: true } });
    return treatments.find(
      (t) => slugify(t.name) === treatmentSlug.toLowerCase() || slugify(t.code) === treatmentSlug.toLowerCase(),
    );
  }

  private aggregatePrices(
    rows: Array<{ min: number | null; max: number | null; currency: string }>,
  ): { min: number; max: number; avg: number; currency: string } | null {
    if (!rows.length) return null;
    const mins: number[] = [];
    const maxs: number[] = [];
    let currency = 'EUR';
    for (const row of rows) {
      if (row.min != null) mins.push(row.min);
      if (row.max != null) maxs.push(row.max);
      if (row.currency) currency = row.currency;
    }
    if (!mins.length && !maxs.length) return null;
    const min = Math.min(...(mins.length ? mins : maxs));
    const max = Math.max(...(maxs.length ? maxs : mins));
    const avg = Math.round((min + max) / 2);
    return { min, max, avg, currency };
  }

  private async getSearchSuggestions(limit: number) {
    const taxonomy = await this.getTaxonomy();
    return {
      countries: [...taxonomy.countries]
        .sort((a, b) => b.clinicCount - a.clinicCount)
        .slice(0, limit)
        .map((c) => ({ slug: c.slug, name: c.name, clinicCount: c.clinicCount })),
      treatments: [...taxonomy.treatments]
        .sort((a, b) => b.clinicCount - a.clinicCount)
        .slice(0, limit)
        .map((t) => ({ slug: t.slug, name: t.name, clinicCount: t.clinicCount })),
    };
  }

  private parseGoogleReviews(raw: unknown): Array<{
    text: string;
    authorName: string;
    rating: number;
    time: number;
  }> {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 5).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const r = item as Record<string, unknown>;
      const text = typeof r.text === 'string' ? r.text : '';
      const authorName =
        typeof r.authorName === 'string'
          ? r.authorName
          : typeof r.author_name === 'string'
            ? r.author_name
            : 'Reviewer';
      const rating = typeof r.rating === 'number' ? r.rating : 0;
      const time =
        typeof r.time === 'number'
          ? r.time
          : typeof r.relative_time_description === 'string'
            ? Date.now()
            : Date.now();
      if (!text) return [];
      return [{ text, authorName, rating, time }];
    });
  }

  private unslugify(slug: string): string {
    return slug.replace(/-/g, ' ');
  }

  async getMedcoverSiteId(): Promise<number> {
    const domain = process.env.CLINIC_SITE_DOMAIN ?? DEFAULT_CLINIC_SITE_DOMAIN;
    const site = await this.prisma.site.findUnique({ where: { domain }, select: { id: true } });
    return site?.id ?? 2;
  }
}
