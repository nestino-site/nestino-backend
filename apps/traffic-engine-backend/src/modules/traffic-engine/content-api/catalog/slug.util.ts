export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function displayNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function treatmentCodeFromSlug(treatmentSlug: string): string {
  return treatmentSlug.toUpperCase().replace(/-/g, '_');
}

export function isTreatmentSlug(slug: string, treatmentSlugs: Set<string> | string[]): boolean {
  const set = treatmentSlugs instanceof Set ? treatmentSlugs : new Set(treatmentSlugs);
  return set.has(slug.toLowerCase());
}

/** Regional indicator symbols from ISO 3166-1 alpha-2 (e.g. ES → 🇪🇸). */
export function countryFlagEmoji(codeIso2: string | null | undefined): string | null {
  if (!codeIso2 || codeIso2.length !== 2) return null;
  const upper = codeIso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  const offset = 0x1f1e6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(
    upper.charCodeAt(0) + offset,
    upper.charCodeAt(1) + offset,
  );
}

export function clinicProfilePath(
  clinicSlug: string,
  citySlug: string,
  countryName: string,
): string {
  const countrySlug = slugify(countryName);
  return `/clinics/${countrySlug}/${citySlug}/${clinicSlug}/`;
}

export function normalizeSlugPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '/';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}
