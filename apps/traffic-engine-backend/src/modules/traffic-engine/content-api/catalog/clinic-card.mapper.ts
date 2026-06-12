import { Decimal } from '@prisma/client/runtime/library';
import { resolveClinicPhotoDisplayUrl } from '../../../clinic-inventory/clinics/utils/clinic-photo.util';
import { clinicProfilePath, slugify } from './slug.util';

export interface ClinicCardTreatment {
  code: string;
  name: string;
  slug: string;
}

export interface ClinicCardPriceRange {
  min: number;
  max: number;
  currency: string;
}

export interface ClinicCardTruthScore {
  composite: number;
  grade: string;
}

export interface ClinicCardGeo {
  slug: string;
  name: string;
}

export interface ClinicCard {
  slug: string;
  name: string;
  urlPath: string;
  photoUrl: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  truthScore: ClinicCardTruthScore | null;
  treatments: ClinicCardTreatment[];
  priceRange: ClinicCardPriceRange | null;
  city: ClinicCardGeo | null;
  country: ClinicCardGeo | null;
  editorialSummary: string | null;
  interviewCount: number;
}

export interface ClinicListRow {
  id: number;
  slug: string;
  name: string;
  googleRating?: Decimal | number | null;
  googleReviewCount?: number | null;
  editorialSummary?: string | null;
  heroImageUrl?: string | null;
  googlePhotos?: unknown;
  city?: {
    slug: string;
    name: string;
    country?: { name: string; codeIso2?: string } | null;
  } | null;
  country?: { name: string; codeIso2?: string } | null;
  media?: Array<{ url: string }>;
  treatments?: Array<{
    isOffered: boolean;
    treatment: { code: string; name: string };
  }>;
  truthScore?: {
    composite: number | null;
    grade: string | null;
    interviewCount?: number;
  } | null;
  pricingPackages?: Array<{
    priceMin: Decimal | number | null;
    priceMax: Decimal | number | null;
    currency: string;
    isActive?: boolean;
  }>;
  _count?: { interviews?: number };
}

function toNumber(value: Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export function aggregatePriceRange(
  packages: ClinicListRow['pricingPackages'],
): ClinicCardPriceRange | null {
  if (!packages?.length) return null;
  const active = packages.filter((p) => p.isActive !== false);
  const rows = active.length ? active : packages;
  let min: number | null = null;
  let max: number | null = null;
  let currency = 'EUR';

  for (const pkg of rows) {
    const pkgMin = toNumber(pkg.priceMin);
    const pkgMax = toNumber(pkg.priceMax);
    if (pkgMin != null) min = min == null ? pkgMin : Math.min(min, pkgMin);
    if (pkgMax != null) max = max == null ? pkgMax : Math.max(max, pkgMax);
    if (pkg.currency) currency = pkg.currency;
  }

  if (min == null && max == null) return null;
  return {
    min: min ?? max ?? 0,
    max: max ?? min ?? 0,
    currency,
  };
}

export function mapClinicToCard(clinic: ClinicListRow): ClinicCard {
  const countryName =
    clinic.country?.name ?? clinic.city?.country?.name ?? 'unknown';
  const countrySlug = slugify(countryName);
  const citySlug = clinic.city?.slug ?? 'unknown';
  const cityName = clinic.city?.name ?? 'Unknown';
  const interviewCount =
    clinic.truthScore?.interviewCount ?? clinic._count?.interviews ?? 0;

  const treatments = (clinic.treatments ?? [])
    .filter((t) => t.isOffered)
    .map((t) => ({
      code: t.treatment.code,
      name: t.treatment.name,
      slug: slugify(t.treatment.name),
    }));

  const rating = toNumber(clinic.googleRating);

  return {
    slug: clinic.slug,
    name: clinic.name,
    urlPath: clinicProfilePath(clinic.slug, citySlug, countryName),
    photoUrl: resolveClinicPhotoDisplayUrl(clinic),
    googleRating: rating,
    googleReviewCount: clinic.googleReviewCount ?? null,
    truthScore:
      clinic.truthScore?.composite != null
        ? {
            composite: clinic.truthScore.composite,
            grade: clinic.truthScore.grade ?? '—',
          }
        : null,
    treatments,
    priceRange: aggregatePriceRange(clinic.pricingPackages),
    city: { slug: citySlug, name: cityName },
    country: { slug: countrySlug, name: countryName },
    editorialSummary: clinic.editorialSummary ?? null,
    interviewCount,
  };
}
