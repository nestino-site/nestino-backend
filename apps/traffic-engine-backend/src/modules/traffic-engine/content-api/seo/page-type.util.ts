import { slugify } from '../catalog/slug.util';

export type MedCoverPageType =
  | 'home'
  | 'clinics_hub'
  | 'clinic_country_plp'
  | 'clinic_city_plp'
  | 'clinic_country_treatment_plp'
  | 'clinic_city_treatment_plp'
  | 'clinic_pdp'
  | 'treatments_hub'
  | 'treatment_detail'
  | 'cost_hub'
  | 'cost_treatment'
  | 'cost_country'
  | 'cost_city'
  | 'compare_hub'
  | 'compare_clinic'
  | 'compare_city'
  | 'compare_country'
  | 'guides_hub'
  | 'guide'
  | 'countries_hub'
  | 'country_landing'
  | 'faq'
  | 'patient_story'
  | 'truth_report'
  | 'origin_journey'
  | 'for_clinics';

export interface PageEntities {
  country?: { slug: string; name: string };
  city?: { slug: string; name: string };
  treatment?: { slug: string; name: string };
  clinics?: Array<{ slug: string; name: string; urlPath: string }>;
}

export function inferPageTypeFromSlug(
  slug: string,
  treatmentSlugs: Set<string>,
): { pageType: MedCoverPageType; entities: PageEntities } {
  const normalized = slug.replace(/\/$/, '') || '/';
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length === 0) {
    return { pageType: 'home', entities: {} };
  }

  const [section, ...rest] = parts;

  if (section === 'clinics') {
    if (rest.length === 0) return { pageType: 'clinics_hub', entities: {} };
    if (rest.length === 1) {
      if (treatmentSlugs.has(rest[0])) {
        return {
          pageType: 'clinic_country_treatment_plp',
          entities: {
            treatment: { slug: rest[0], name: rest[0] },
          },
        };
      }
      return {
        pageType: 'clinic_country_plp',
        entities: { country: { slug: rest[0], name: rest[0] } },
      };
    }
    if (rest.length === 2) {
      if (treatmentSlugs.has(rest[1])) {
        return {
          pageType: 'clinic_country_treatment_plp',
          entities: {
            country: { slug: rest[0], name: rest[0] },
            treatment: { slug: rest[1], name: rest[1] },
          },
        };
      }
      return {
        pageType: 'clinic_city_plp',
        entities: {
          country: { slug: rest[0], name: rest[0] },
          city: { slug: rest[1], name: rest[1] },
        },
      };
    }
    if (rest.length === 3 && treatmentSlugs.has(rest[2])) {
      return {
        pageType: 'clinic_city_treatment_plp',
        entities: {
          country: { slug: rest[0], name: rest[0] },
          city: { slug: rest[1], name: rest[1] },
          treatment: { slug: rest[2], name: rest[2] },
        },
      };
    }
    return {
      pageType: 'clinic_pdp',
      entities: {
        country: { slug: rest[0], name: rest[0] },
        city: { slug: rest[1], name: rest[1] },
      },
    };
  }

  if (section === 'treatments') {
    if (rest.length === 0) return { pageType: 'treatments_hub', entities: {} };
    return {
      pageType: 'treatment_detail',
      entities: { treatment: { slug: rest[0], name: rest[0] } },
    };
  }

  if (section === 'cost') {
    if (rest.length === 0) return { pageType: 'cost_hub', entities: {} };
    if (rest.length === 1) {
      return {
        pageType: 'cost_treatment',
        entities: { treatment: { slug: rest[0], name: rest[0] } },
      };
    }
    if (rest.length === 2) {
      return {
        pageType: 'cost_country',
        entities: {
          treatment: { slug: rest[0], name: rest[0] },
          country: { slug: rest[1], name: rest[1] },
        },
      };
    }
    return {
      pageType: 'cost_city',
      entities: {
        treatment: { slug: rest[0], name: rest[0] },
        country: { slug: rest[1], name: rest[1] },
        city: { slug: rest[2], name: rest[2] },
      },
    };
  }

  if (section === 'compare') {
    if (rest.length === 0) return { pageType: 'compare_hub', entities: {} };
    const compareSlug = rest.join('-');
    if (compareSlug.includes('-for-')) {
      if (compareSlug.includes('-vs-')) {
        return { pageType: 'compare_country', entities: {} };
      }
    }
    return { pageType: 'compare_clinic', entities: {} };
  }

  if (section === 'guides') {
    if (rest.length === 0) return { pageType: 'guides_hub', entities: {} };
    return { pageType: 'guide', entities: {} };
  }

  if (section === 'countries') {
    if (rest.length === 0) return { pageType: 'countries_hub', entities: {} };
    return {
      pageType: 'country_landing',
      entities: { country: { slug: rest[0], name: rest[0] } },
    };
  }

  if (section === 'faq') return { pageType: 'faq', entities: {} };
  if (section === 'patient-stories') return { pageType: 'patient_story', entities: {} };
  if (section === 'reports') return { pageType: 'truth_report', entities: {} };
  if (section === 'from') return { pageType: 'origin_journey', entities: {} };
  if (section === 'for-clinics') return { pageType: 'for_clinics', entities: {} };

  return { pageType: 'guide', entities: {} };
}

export function buildAffectedPaths(slug: string, pageType?: string): string[] {
  const normalized = slug.endsWith('/') ? slug : `${slug}/`;
  const parts = normalized.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean);
  const paths = new Set<string>([normalized]);

  if (parts[0] === 'clinics') {
    paths.add('/clinics/');
    if (parts.length >= 2) paths.add(`/clinics/${parts[1]}/`);
    if (parts.length >= 3) paths.add(`/clinics/${parts[1]}/${parts[2]}/`);
    if (parts.length >= 4) paths.add(`/clinics/${parts[1]}/${parts[2]}/${parts[3]}/`);
    if (parts.length >= 2) paths.add(`/countries/${parts[1]}/`);
  }

  if (parts[0] === 'cost') {
    paths.add('/cost/');
    if (parts.length >= 2) paths.add(`/cost/${parts[1]}/`);
    if (parts.length >= 3) paths.add(`/cost/${parts[1]}/${parts[2]}/`);
    if (parts.length >= 2) paths.add(`/countries/${parts[2] ?? parts[1]}/`);
  }

  if (parts[0] === 'countries' && parts.length >= 2) {
    paths.add('/countries/');
    paths.add(`/countries/${parts[1]}/`);
  }

  if (pageType?.startsWith('clinic_')) {
    paths.add('/clinics/');
  }

  return [...paths];
}

export function buildClinicAffectedPaths(payload: {
  slug: string;
  countrySlug?: string;
  citySlug?: string;
  treatments?: string[];
}): string[] {
  const countrySlug = payload.countrySlug ?? 'unknown';
  const citySlug = payload.citySlug ?? 'unknown';
  const paths = new Set<string>([
    `/clinics/${countrySlug}/${citySlug}/${payload.slug}/`,
    `/clinics/${countrySlug}/${citySlug}/`,
    `/clinics/${countrySlug}/`,
    '/clinics/',
    `/countries/${countrySlug}/`,
  ]);

  for (const treatment of payload.treatments ?? ['IVF']) {
    const treatmentSlug = slugify(treatment);
    paths.add(`/clinics/${countrySlug}/${treatmentSlug}/`);
    paths.add(`/clinics/${countrySlug}/${citySlug}/${treatmentSlug}/`);
  }

  return [...paths];
}
