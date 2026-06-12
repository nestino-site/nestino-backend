import {
  inferPageTypeFromSlug,
  parseGuideEntitiesFromSlugParts,
} from './page-type.util';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const treatmentSlugs = new Set(['ivf', 'ivf-in-vitro-fertilisation', 'egg-donation']);

// Country guide: guides/spain-ivf-guide
const countryGuide = inferPageTypeFromSlug('/guides/spain-ivf-guide', treatmentSlugs);
assert(countryGuide.pageType === 'guide', 'country guide pageType');
assert(countryGuide.entities.country?.slug === 'spain', 'country guide country slug');
assert(countryGuide.entities.treatment?.slug === 'ivf', 'country guide treatment slug');
assert(!countryGuide.entities.city, 'country guide no city');

// City flat: guides/spain-barcelona-ivf-guide
const cityFlat = inferPageTypeFromSlug('/guides/spain-barcelona-ivf-guide', treatmentSlugs);
assert(cityFlat.entities.country?.slug === 'spain', 'city flat country');
assert(cityFlat.entities.city?.slug === 'barcelona', 'city flat city');
assert(cityFlat.entities.treatment?.slug === 'ivf', 'city flat treatment');

// Nested: guides/spain/barcelona-ivf-guide
const nested = inferPageTypeFromSlug('/guides/spain/barcelona-ivf-guide', treatmentSlugs);
assert(nested.entities.country?.slug === 'spain', 'nested country');
assert(nested.entities.city?.slug === 'barcelona', 'nested city');
assert(nested.entities.treatment?.slug === 'ivf', 'nested treatment');

// Non-IVF treatment when in slug set
const eggGuide = inferPageTypeFromSlug('/guides/spain-egg-donation-guide', treatmentSlugs);
assert(eggGuide.entities.treatment?.slug === 'egg-donation', 'egg donation treatment');

// Topic article without -guide suffix → empty entities
const topic = inferPageTypeFromSlug('/guides/ivf-lifestyle-pre-treatment-plan', treatmentSlugs);
assert(topic.pageType === 'guide', 'topic pageType guide');
assert(Object.keys(topic.entities).length === 0, 'topic has no entities');

// Unknown country in pattern still returns raw slug (validation drops later)
const parts = parseGuideEntitiesFromSlugParts(['portugal-ivf-guide'], treatmentSlugs);
assert(parts.country?.slug === 'portugal', 'raw portugal slug');

// Clinic PLP unchanged
const clinic = inferPageTypeFromSlug('/clinics/spain', treatmentSlugs);
assert(clinic.pageType === 'clinic_country_plp', 'clinic country plp');
assert(clinic.entities.country?.slug === 'spain', 'clinic country slug');

console.log('page-type.util.spec.ts: all assertions passed');
