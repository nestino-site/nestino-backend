import { parseGuideEntitiesFromSlugParts } from './page-type.util';

/** Treatment slugs used when parsing guide URL paths (IVF + hair restoration). */
export const GUIDE_TREATMENT_SLUGS = new Set([
  'ivf',
  'ivf-in-vitro-fertilisation',
  'egg-donation',
  'hair-restoration',
]);

export interface GuideGeoContext {
  citySlug?: string;
  cityName?: string;
  countrySlug?: string;
  countryName?: string;
  /** Human-readable location for prompts, e.g. "Istanbul, Turkey". */
  location?: string;
  isCityGuide: boolean;
  geoConstraint?: string;
}

/** Common geo tokens in hair-transplant / IVF keywords used to filter cross-city secondary keywords. */
const KNOWN_CITY_SLUGS = [
  'istanbul',
  'barcelona',
  'madrid',
  'athens',
  'thessaloniki',
  'antalya',
  'prague',
  'brno',
  'lisbon',
  'porto',
  'bucharest',
  'warsaw',
  'krakow',
  'budapest',
  'dubai',
  'london',
  'manchester',
];

const KNOWN_COUNTRY_SLUGS = [
  'turkey',
  'spain',
  'greece',
  'portugal',
  'czech',
  'czechia',
  'poland',
  'hungary',
  'romania',
  'uk',
  'uae',
];

export function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function extractGuideGeoFromPage(page: {
  slug: string;
  title?: string | null;
}): GuideGeoContext {
  const normalized = page.slug.replace(/\/$/, '') || '/';
  const parts = normalized.split('/').filter(Boolean);

  if (parts[0] !== 'guides') {
    return { isCityGuide: false };
  }

  const entities = parseGuideEntitiesFromSlugParts(parts.slice(1), GUIDE_TREATMENT_SLUGS);
  let citySlug = entities.city?.slug;
  let countrySlug = entities.country?.slug;

  let cityName = citySlug ? slugToDisplayName(citySlug) : undefined;
  let countryName = countrySlug ? slugToDisplayName(countrySlug) : undefined;

  const isNestedCityGuideSlug = parts.length >= 3;
  if (!cityName && isNestedCityGuideSlug && page.title) {
    const titleMatch = page.title.match(/\b(?:in|for)\s+([^:,]+)/i);
    if (titleMatch) {
      cityName = titleMatch[1].trim();
      if (!citySlug) {
        citySlug = cityName.toLowerCase().replace(/\s+/g, '-');
      }
    }
  }

  if (!countryName && countrySlug) {
    countryName = slugToDisplayName(countrySlug);
  }

  const isCityGuide = Boolean(citySlug);
  const location =
    cityName && countryName
      ? `${cityName}, ${countryName}`
      : cityName ?? countryName ?? undefined;

  const geo: GuideGeoContext = {
    citySlug,
    cityName,
    countrySlug,
    countryName,
    location,
    isCityGuide: Boolean(citySlug),
  };
  geo.geoConstraint = buildGeoConstraint(geo);
  return geo;
}

export function buildGeoConstraint(geo: GuideGeoContext): string | undefined {
  if (geo.isCityGuide && geo.cityName && geo.countryName) {
    return (
      `Write ONLY about ${geo.cityName}, ${geo.countryName}. ` +
      `Do not describe clinics, neighborhoods, or recommendations for any other city or country. ` +
      `The H1, breadcrumbs, and clinic examples must reference ${geo.cityName}. ` +
      `Comparison sections may mention other destinations briefly, but the main focus must stay on ${geo.cityName}.`
    );
  }

  if (geo.countryName && !geo.isCityGuide) {
    return (
      `Write ONLY about ${geo.countryName}. ` +
      `Do not focus the guide on a different country or substitute another destination.`
    );
  }

  return undefined;
}

function keywordContainsSlug(keyword: string, slug: string): boolean {
  const lower = keyword.toLowerCase();
  const spaced = slug.replace(/-/g, ' ');
  return lower.includes(slug) || lower.includes(spaced);
}

function keywordMentionsOtherGeo(keyword: string, geo: GuideGeoContext): boolean {
  const lower = keyword.toLowerCase();

  for (const city of KNOWN_CITY_SLUGS) {
    if (geo.citySlug && city === geo.citySlug) continue;
    if (keywordContainsSlug(lower, city)) return true;
  }

  for (const country of KNOWN_COUNTRY_SLUGS) {
    if (geo.countrySlug && country === geo.countrySlug) continue;
    if (keywordContainsSlug(lower, country)) return true;
  }

  return false;
}

/** Drop cross-city / cross-country secondary keywords for geo-scoped guide pages. */
export function filterSecondaryKeywordsByGeo(
  keywords: string[],
  geo: GuideGeoContext,
): string[] {
  if (!geo.isCityGuide && !geo.countrySlug) {
    return keywords;
  }

  return keywords.filter((keyword) => !keywordMentionsOtherGeo(keyword, geo));
}

/** Returns true when visible content focuses on the wrong city/country for this guide slug. */
export function contentGeoMisaligned(
  content: string,
  slug: string,
  title?: string | null,
): boolean {
  const geo = extractGuideGeoFromPage({ slug, title });
  if (!geo.isCityGuide && !geo.countrySlug) {
    return false;
  }

  const h1 = (content.match(/^#\s+(.+)$/m)?.[1] ?? '').toLowerCase();
  const head = content.slice(0, 1500).toLowerCase();
  const targetCity = geo.cityName?.toLowerCase();

  for (const citySlug of KNOWN_CITY_SLUGS) {
    if (geo.citySlug && citySlug === geo.citySlug) continue;
    const cityName = slugToDisplayName(citySlug).toLowerCase();
    const inCity = new RegExp(`\\bin\\s+${cityName}\\b`, 'i');
    if (inCity.test(h1) || (geo.isCityGuide && inCity.test(head.slice(0, 400)))) {
      return true;
    }
  }

  for (const countrySlug of KNOWN_COUNTRY_SLUGS) {
    if (geo.countrySlug && countrySlug === geo.countrySlug) continue;
    const countryName = slugToDisplayName(countrySlug).toLowerCase();
    const inCountry = new RegExp(`\\bin\\s+${countryName}\\b`, 'i');
    if (inCountry.test(h1) || (geo.isCityGuide && inCountry.test(head.slice(0, 400)))) {
      return true;
    }
  }

  if (geo.isCityGuide && targetCity && h1 && !h1.includes(targetCity)) {
    return KNOWN_CITY_SLUGS.some((citySlug) => {
      if (citySlug === geo.citySlug) return false;
      return new RegExp(`\\bin\\s+${slugToDisplayName(citySlug).toLowerCase()}\\b`, 'i').test(h1);
    });
  }

  return false;
}
