import { z } from 'zod';

// ── Input ──────────────────────────────────────────────────────────────────

export interface ClinicEnrichmentInput {
  /** Clinic display name as stored in DB */
  name: string;
  /** City name, e.g. "Valencia" */
  city: string;
  /** Country name, e.g. "Spain" */
  country: string;

  // ── Verified contact / location data (from DB) ─────────────────────────────
  /** Street address if available */
  addressLine: string | null;
  /** Public phone number */
  phone: string | null;
  /** Clinic website URL */
  websiteUrl: string | null;
  /** Languages spoken at the clinic, e.g. ["en", "es"] */
  languages: string[];
  /** Year the clinic was founded */
  foundedYear: number | null;
  /** Number of doctors on staff (verified) */
  doctorsCount: number | null;
  /**
   * Treatment names verified in the DB (from clinic_treatments join).
   * This is the canonical source for the services field.
   */
  verifiedTreatments: string[];
  /** Accreditation names from the DB */
  accreditations: string[];

  // ── Google Places data ──────────────────────────────────────────────────────
  /** Google Maps URL for the listing */
  googleMapsUrl: string | null;
  /** Place types from Google, e.g. ["dentist", "health"] */
  placeTypes: string[];
  /** Editorial / AI summary from Google Places (may be null) */
  editorialSummary: string | null;
  /** Google rating, e.g. 4.7 */
  googleRating: number | null;
  /** Number of Google reviews */
  googleReviewCount: number | null;
  /** Raw snippet of Google user reviews (max 5, plain text only) */
  googleReviewSnippets: string[];
}

// ── Output schema (zod) ────────────────────────────────────────────────────

export const SeoMetaSchema = z.object({
  /** SEO title tag, 50-65 chars, includes clinic name + specialty + location */
  title: z.string().max(100),
  /** Meta description, 140-160 chars, user-facing value prop */
  description: z.string().max(300),
});

export const LocalFaqSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const ClinicEnrichmentResultSchema = z.object({
  seoMeta: SeoMetaSchema,
  /**
   * 2-4 paragraph user-friendly overview derived strictly from Google source
   * data. Must NOT introduce unverified services, staff names, or prices.
   */
  clinicOverview: z.string(),
  /**
   * Inferred medical services based solely on placeTypes and editorialSummary.
   * Each item is a plain human-readable service name, e.g. "General Dentistry".
   * Null or empty array is acceptable when insufficient data is available.
   */
  services: z.array(z.string()).nullable(),
  /**
   * 3-5 FAQs relevant to patients seeking this specialty in the exact city.
   * Must reference the correct city (no neighbouring cities).
   */
  localFaqs: z.array(LocalFaqSchema).min(3).max(5),
});

export type ClinicEnrichmentResult = z.infer<typeof ClinicEnrichmentResultSchema>;
export type SeoMeta = z.infer<typeof SeoMetaSchema>;
export type LocalFaq = z.infer<typeof LocalFaqSchema>;
