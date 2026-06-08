import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import {
  clinicHasPhoto,
  resolveClinicPhotoDisplayUrl,
} from '../../clinic-inventory/clinics/utils/clinic-photo.util';

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
  heroImageUrl?: string | null;
  googlePhotos?: unknown;
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

function offeredTreatmentNames(clinic: ClinicListItem): string[] {
  return (clinic.treatments ?? [])
    .filter((t) => t.isOffered)
    .map((t) => t.treatment.name || t.treatment.code);
}

function parseGoogleReviews(raw: unknown): Array<{ text?: string; authorName?: string; rating?: number }> {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((item) => {
    if (!item || typeof item !== 'object') return {};
    const r = item as Record<string, unknown>;
    const authorName =
      typeof r.authorName === 'string'
        ? r.authorName
        : typeof r.author_name === 'string'
          ? r.author_name
          : undefined;
    return {
      text: typeof r.text === 'string' ? r.text : undefined,
      authorName,
      rating: typeof r.rating === 'number' ? r.rating : undefined,
    };
  });
}

function parseOpeningHours(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const hours = raw as Record<string, unknown>;
  for (const key of ['weekdayDescriptions', 'weekday_text'] as const) {
    const weekday = hours[key];
    if (Array.isArray(weekday)) {
      return weekday.filter((line): line is string => typeof line === 'string');
    }
  }
  return [];
}

function extractLeadingH1(content: string | null, fallbackHeading: string): { h1: string; body: string } {
  const fallback = `# ${fallbackHeading.replace(/^##\s+/, '')}`;
  if (!content?.trim()) {
    return { h1: fallback, body: '' };
  }

  const trimmed = content.trim();
  const match = trimmed.match(/^#\s+(.+?)(?:\n|$)/);
  if (match) {
    const h1 = `# ${match[1].trim()}`;
    const body = trimmed.slice(match[0].length).trim();
    return { h1, body };
  }

  return { h1: fallback, body: trimmed };
}

function stripClinicDirectoryBlock(content: string): string {
  const startIdx = content.indexOf(CLINIC_DIRECTORY_START);
  const endIdx = content.indexOf(CLINIC_DIRECTORY_END);
  if (startIdx >= 0 && endIdx > startIdx) {
    const before = content.slice(0, startIdx).trim();
    const after = content.slice(endIdx + CLINIC_DIRECTORY_END.length).trim();
    return [before, after].filter(Boolean).join('\n\n').trim();
  }
  return content.trim();
}

@Injectable()
export class ClinicPageContentBuilder {
  buildDetailContent(clinic: ClinicDetailData): string {
    const cityName = clinic.city?.name ?? 'Unknown city';
    const countryName = clinic.country?.name ?? clinic.city?.country?.name ?? 'Unknown country';
    const rating = formatRating(clinic.googleRating);
    const phone = clinic.phone ?? clinic.formattedPhone;
    const treatments = offeredTreatmentNames(clinic);
    const treatmentLabel = treatments.length ? treatments.join(', ') : 'IVF and fertility';

    const lines: string[] = [
      `# ${clinic.name}`,
      '',
      `${treatmentLabel} clinic in ${cityName}, ${countryName}.`,
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
  const count = clinics.length;
  const lines: string[] = [
    heading,
    '',
    count > 0
      ? `Showing **${count}** verified clinic${count === 1 ? '' : 's'}, sorted by Google rating.`
      : 'No published clinics in this scope yet.',
    '',
  ];

  const sorted = [...clinics].sort((a, b) => {
    const ra = a.googleRating != null ? Number(a.googleRating) : -1;
    const rb = b.googleRating != null ? Number(b.googleRating) : -1;
    return rb - ra;
  });

  for (let i = 0; i < sorted.length; i++) {
    const clinic = sorted[i];
    const profilePath = clinicProfilePath(clinic);
    const rating = formatRating(clinic.googleRating);
    const phone = clinic.phone ?? clinic.formattedPhone;
    const treatmentNames = offeredTreatmentNames(clinic);

    lines.push(`### [${clinic.name}](${profilePath})`);

    if (clinicHasPhoto(clinic)) {
      const photoUrl = resolveClinicPhotoDisplayUrl(clinic);
      if (photoUrl) {
        lines.push('', `[![${clinic.name}](${photoUrl})](${profilePath})`);
      }
    }

    const metaParts: string[] = [];
    if (rating != null) {
      metaParts.push(`**Rating:** ${rating}/5 (${clinic.googleReviewCount ?? 0} reviews)`);
    }
    if (clinic.addressLine) metaParts.push(`**Address:** ${clinic.addressLine}`);
    if (phone) metaParts.push(`**Phone:** ${phone}`);
    if (clinic.websiteUrl) metaParts.push(`**Website:** ${formatWebsite(clinic.websiteUrl)}`);
    if (clinic.city?.name) metaParts.push(`**City:** ${clinic.city.name}`);
    if (treatmentNames.length) metaParts.push(`**Treatments:** ${treatmentNames.join(', ')}`);
    if (clinic.truthScore?.composite != null) {
      metaParts.push(
        `**Truth Score:** ${clinic.truthScore.composite}/100 (${clinic.truthScore.grade ?? '—'})`,
      );
    }

    if (metaParts.length) {
      lines.push('', metaParts.join(' · '));
    }
    if (clinic.editorialSummary) {
      lines.push('', clinic.editorialSummary.trim());
    }
    lines.push('', `[View full profile →](${profilePath})`);

    if (i < sorted.length - 1) {
      lines.push('', '---', '');
    }
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

  const stripped = existingContent ? stripClinicDirectoryBlock(existingContent) : '';
  const { h1, body } = extractLeadingH1(stripped || null, heading);

  return [h1, '', wrapped, body].filter((part) => part.trim().length > 0).join('\n\n').trim();
}
