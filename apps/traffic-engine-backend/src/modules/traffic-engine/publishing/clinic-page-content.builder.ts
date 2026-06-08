import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

export const CLINIC_DIRECTORY_START = '<!-- CLINIC_DIRECTORY_START -->';
export const CLINIC_DIRECTORY_END = '<!-- CLINIC_DIRECTORY_END -->';

export interface ClinicListItem {
  id: number;
  slug: string;
  name: string;
  phone?: string | null;
  formattedPhone?: string | null;
  websiteUrl?: string | null;
  addressLine?: string | null;
  googleRating?: Decimal | number | null;
  googleReviewCount?: number | null;
  editorialSummary?: string | null;
  googleMapsUrl?: string | null;
  city?: { slug: string; name: string; country?: { name: string; codeIso2: string } | null } | null;
  country?: { name: string; codeIso2: string } | null;
  media?: Array<{ url: string }>;
  treatments?: Array<{ isOffered: boolean; treatment: { code: string; name: string } }>;
  truthScore?: { composite: number | null; grade: string | null } | null;
}

export interface ClinicDetailData extends ClinicListItem {
  googleReviews?: unknown;
  openingHours?: unknown;
  doctors?: Array<{ name: string; title?: string | null; specialties?: string[] }>;
  longDescription?: string | null;
  shortDescription?: string | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function displayNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRating(rating: Decimal | number | null | undefined): string | null {
  if (rating == null) return null;
  const num = typeof rating === 'number' ? rating : Number(rating);
  return Number.isFinite(num) ? num.toFixed(1) : null;
}

function clinicProfilePath(clinic: ClinicListItem): string {
  const countrySlug = clinic.country?.name
    ? slugify(clinic.country.name)
    : clinic.city?.country?.name
      ? slugify(clinic.city.country.name)
      : 'unknown';
  const citySlug = clinic.city?.slug ?? 'unknown';
  return `/clinics/${countrySlug}/${citySlug}/${clinic.slug}`;
}

function formatWebsite(url?: string | null): string {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return `[${host}](${url})`;
  } catch {
    return url;
  }
}

function parseGoogleReviews(raw: unknown): Array<{ text?: string; authorName?: string; rating?: number }> {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((item) => {
    if (!item || typeof item !== 'object') return {};
    const r = item as Record<string, unknown>;
    return {
      text: typeof r.text === 'string' ? r.text : undefined,
      authorName: typeof r.authorName === 'string' ? r.authorName : undefined,
      rating: typeof r.rating === 'number' ? r.rating : undefined,
    };
  });
}

function parseOpeningHours(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const hours = raw as Record<string, unknown>;
  const weekday = hours.weekdayDescriptions;
  if (Array.isArray(weekday)) {
    return weekday.filter((line): line is string => typeof line === 'string');
  }
  return [];
}

@Injectable()
export class ClinicPageContentBuilder {
  buildDetailContent(clinic: ClinicDetailData): string {
    const cityName = clinic.city?.name ?? 'Unknown city';
    const countryName = clinic.country?.name ?? clinic.city?.country?.name ?? 'Unknown country';
    const rating = formatRating(clinic.googleRating);
    const phone = clinic.phone ?? clinic.formattedPhone;
    const treatments = (clinic.treatments ?? [])
      .filter((t) => t.isOffered)
      .map((t) => t.treatment.name || t.treatment.code);

    const lines: string[] = [
      `# ${clinic.name}`,
      '',
      `IVF and fertility clinic in ${cityName}, ${countryName}.`,
    ];

    const summary = clinic.editorialSummary ?? clinic.shortDescription ?? clinic.longDescription;
    if (summary) {
      lines.push('', summary.trim());
    }

    lines.push('', '## Contact Information');
    if (phone) lines.push(`- **Phone:** ${phone}`);
    if (clinic.websiteUrl) lines.push(`- **Website:** ${formatWebsite(clinic.websiteUrl)}`);
    if (clinic.addressLine) lines.push(`- **Address:** ${clinic.addressLine}`);
    if (clinic.googleMapsUrl) lines.push(`- **Google Maps:** [View on Maps](${clinic.googleMapsUrl})`);

    if (rating) {
      lines.push('', '## Google Rating');
      const count = clinic.googleReviewCount ?? 0;
      lines.push(`**${rating} / 5** based on **${count}** Google reviews.`);
    }

    if (treatments.length) {
      lines.push('', '## Treatments Offered', treatments.join(', '));
    }

    const hours = parseOpeningHours(clinic.openingHours);
    if (hours.length) {
      lines.push('', '## Opening Hours', ...hours.map((h) => `- ${h}`));
    }

    if (clinic.doctors?.length) {
      lines.push('', '## Medical Team');
      for (const doc of clinic.doctors.slice(0, 8)) {
        const title = doc.title ? ` — ${doc.title}` : '';
        const specs = doc.specialties?.length ? ` (${doc.specialties.join(', ')})` : '';
        lines.push(`- **${doc.name}**${title}${specs}`);
      }
    }

    const reviews = parseGoogleReviews(clinic.googleReviews);
    if (reviews.length) {
      lines.push('', '## Google Reviews');
      for (const review of reviews) {
        const author = review.authorName ?? 'Google reviewer';
        const stars = review.rating != null ? ` (${review.rating}/5)` : '';
        const text = review.text?.trim() ?? '';
        if (text) {
          lines.push('', `> "${text}"`, `>`, `> — ${author}${stars}`);
        }
      }
    }

    return lines.join('\n').trim();
  }

  buildListingContent(slug: string, existingContent: string | null, clinics: ClinicListItem[]): string {
    const parts = slug.split('/').filter(Boolean);
    if (parts.length >= 4) {
      throw new Error(`buildListingContent called for detail slug: ${slug}`);
    }

    if (parts[1] === 'treatment') {
      const treatmentSlug = parts[2] ?? 'ivf';
      const treatmentName = displayNameFromSlug(treatmentSlug);
      return this.buildTreatmentListingContent(existingContent, treatmentName, clinics);
    }

    if (parts.length === 3) {
      const cityName = displayNameFromSlug(parts[2]);
      return this.buildCityListingContent(existingContent, cityName, clinics);
    }

    const countryName = displayNameFromSlug(parts[1] ?? 'unknown');
    return this.buildCountryListingContent(existingContent, countryName, clinics);
  }

  buildCityListingContent(
    existingContent: string | null,
    cityName: string,
    clinics: ClinicListItem[],
  ): string {
    const heading = `## IVF Clinics in ${cityName} (${clinics.length} clinic${clinics.length === 1 ? '' : 's'})`;
    return injectClinicDirectory(existingContent, heading, clinics);
  }

  buildCountryListingContent(
    existingContent: string | null,
    countryName: string,
    clinics: ClinicListItem[],
  ): string {
    const heading = `## IVF Clinics in ${countryName} (${clinics.length} clinic${clinics.length === 1 ? '' : 's'})`;
    return injectClinicDirectory(existingContent, heading, clinics);
  }

  buildTreatmentListingContent(
    existingContent: string | null,
    treatmentName: string,
    clinics: ClinicListItem[],
  ): string {
    const heading = `## ${treatmentName} Clinics (${clinics.length} clinic${clinics.length === 1 ? '' : 's'})`;
    return injectClinicDirectory(existingContent, heading, clinics);
  }
}

function buildClinicDirectoryMarkdown(heading: string, clinics: ClinicListItem[]): string {
  const lines: string[] = [heading, ''];

  const sorted = [...clinics].sort((a, b) => {
    const ra = a.googleRating != null ? Number(a.googleRating) : -1;
    const rb = b.googleRating != null ? Number(b.googleRating) : -1;
    return rb - ra;
  });

  for (const clinic of sorted) {
    const rating = formatRating(clinic.googleRating);
    const reviewPart =
      rating != null
        ? `**Rating:** ${rating}/5 (${clinic.googleReviewCount ?? 0} reviews)`
        : null;
    const addressPart = clinic.addressLine ? `**Address:** ${clinic.addressLine}` : null;
    const phone = clinic.phone ?? clinic.formattedPhone;
    const phonePart = phone ? `**Phone:** ${phone}` : null;
    const websitePart = clinic.websiteUrl ? `**Website:** ${formatWebsite(clinic.websiteUrl)}` : null;
    const cityPart = clinic.city?.name ? `**City:** ${clinic.city.name}` : null;
    const truthPart =
      clinic.truthScore?.composite != null
        ? `**Truth Score:** ${clinic.truthScore.composite}/100 (${clinic.truthScore.grade ?? '—'})`
        : null;

    lines.push(`### ${clinic.name}`);
    const meta = [reviewPart, addressPart, phonePart, websitePart, cityPart, truthPart]
      .filter(Boolean)
      .join(' · ');
    if (meta) lines.push(meta);
    if (clinic.editorialSummary) {
      lines.push('', clinic.editorialSummary.trim());
    }
    lines.push('', `[View Profile](${clinicProfilePath(clinic)})`, '');
  }

  return lines.join('\n').trim();
}

function injectClinicDirectory(
  existingContent: string | null,
  heading: string,
  clinics: ClinicListItem[],
): string {
  const directoryBlock = buildClinicDirectoryMarkdown(heading, clinics);
  const wrapped = `${CLINIC_DIRECTORY_START}\n${directoryBlock}\n${CLINIC_DIRECTORY_END}`;

  if (!existingContent?.trim()) {
    return `# ${heading.replace(/^##\s+/, '')}\n\n${wrapped}`;
  }

  const startIdx = existingContent.indexOf(CLINIC_DIRECTORY_START);
  const endIdx = existingContent.indexOf(CLINIC_DIRECTORY_END);

  if (startIdx >= 0 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx).trimEnd();
    const after = existingContent.slice(endIdx + CLINIC_DIRECTORY_END.length).trim();
    return [before, wrapped, after].filter(Boolean).join('\n\n').trim();
  }

  return `${existingContent.trimEnd()}\n\n${wrapped}`;
}
