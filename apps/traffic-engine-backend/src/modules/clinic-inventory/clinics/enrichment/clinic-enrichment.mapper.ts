import { Prisma } from '@prisma/client';
import { ClinicEnrichmentInput, ClinicEnrichmentResult } from './clinic-enrichment.types';

export interface ClinicForEnrichment {
  name: string;
  addressLine: string | null;
  phone: string | null;
  formattedPhone: string | null;
  websiteUrl: string | null;
  languages: string[];
  foundedYear: number | null;
  doctorsCount: number | null;
  googleMapsUrl: string | null;
  placeTypes: string[];
  editorialSummary: string | null;
  googleRating: Prisma.Decimal | number | null;
  googleReviewCount: number | null;
  googleReviews: unknown;
  sourcePayload: unknown;
  city: {
    name: string;
    country: { name: string } | null;
  } | null;
  country: { name: string } | null;
  treatments: Array<{ isOffered: boolean; treatment: { name: string } }>;
  accreditations: Array<{ accreditation: { name: string } }>;
}

interface GoogleReviewEntry {
  text?: string;
}

export function extractReviewSnippets(googleReviews: unknown): string[] {
  if (!Array.isArray(googleReviews)) return [];
  return (googleReviews as GoogleReviewEntry[])
    .map((r) => (typeof r?.text === 'string' ? r.text.slice(0, 400) : null))
    .filter((t): t is string => t !== null && t.trim().length > 10)
    .slice(0, 5);
}

export function buildEnrichmentInput(clinic: ClinicForEnrichment): ClinicEnrichmentInput {
  const country = clinic.city?.country ?? clinic.country;
  if (!clinic.city || !country) {
    throw new Error('Clinic must have a city linked to a country before enrichment');
  }

  return {
    name: clinic.name,
    city: clinic.city.name,
    country: country.name,
    addressLine: clinic.addressLine ?? null,
    phone: clinic.phone ?? clinic.formattedPhone ?? null,
    websiteUrl: clinic.websiteUrl ?? null,
    languages: clinic.languages ?? [],
    foundedYear: clinic.foundedYear ?? null,
    doctorsCount: clinic.doctorsCount ?? null,
    verifiedTreatments: (clinic.treatments ?? [])
      .filter((ct) => ct.isOffered)
      .map((ct) => ct.treatment.name)
      .filter(Boolean),
    accreditations: (clinic.accreditations ?? [])
      .map((ca) => ca.accreditation.name)
      .filter(Boolean),
    googleMapsUrl: clinic.googleMapsUrl ?? null,
    placeTypes: clinic.placeTypes ?? [],
    editorialSummary: clinic.editorialSummary ?? null,
    googleRating: clinic.googleRating !== null ? Number(clinic.googleRating) : null,
    googleReviewCount: clinic.googleReviewCount ?? null,
    googleReviewSnippets: extractReviewSnippets(clinic.googleReviews),
  };
}

export function stripHtml(text: string): string {
  return text
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function readAiEnrichment(sourcePayload: unknown): ClinicEnrichmentResult | null {
  if (!sourcePayload || typeof sourcePayload !== 'object') return null;
  const payload = sourcePayload as Record<string, unknown>;
  const raw = payload.aiEnrichment;
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (!data.seoMeta || !data.clinicOverview || !Array.isArray(data.localFaqs)) return null;
  return raw as ClinicEnrichmentResult;
}

export function buildApplyData(
  existingSourcePayload: unknown,
  result: ClinicEnrichmentResult,
): Prisma.ClinicUpdateInput {
  const existing =
    existingSourcePayload && typeof existingSourcePayload === 'object'
      ? (existingSourcePayload as Record<string, unknown>)
      : {};

  return {
    shortDescription: result.seoMeta.description.slice(0, 500),
    longDescription: stripHtml(result.clinicOverview),
    sourcePayload: {
      ...existing,
      aiEnrichment: {
        ...result,
        appliedAt: new Date().toISOString(),
      },
    } as Prisma.InputJsonValue,
  };
}
