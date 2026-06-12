import { slugify } from '../catalog/slug.util';
import { resolveEntitiesAgainstMaps } from './entity-resolver.service';
import { PageEntities } from './page-type.util';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const maps = {
  countriesBySlug: new Map([
    ['spain', { slug: 'spain', name: 'Spain' }],
    ['greece', { slug: 'greece', name: 'Greece' }],
  ]),
  citiesBySlug: new Map([
    [
      'barcelona',
      { slug: 'barcelona', name: 'Barcelona', countrySlug: 'spain' },
    ],
  ]),
  treatmentsBySlug: new Map([
    [
      slugify('IVF — In Vitro Fertilisation'),
      { slug: slugify('IVF — In Vitro Fertilisation'), name: 'IVF — In Vitro Fertilisation' },
    ],
    ['ivf', { slug: slugify('IVF — In Vitro Fertilisation'), name: 'IVF — In Vitro Fertilisation' }],
  ]),
};

const resolved = resolveEntitiesAgainstMaps(
  {
    country: { slug: 'spain', name: 'spain' },
    city: { slug: 'barcelona', name: 'barcelona' },
    treatment: { slug: 'ivf', name: 'ivf' },
  } satisfies PageEntities,
  maps,
);

assert(resolved.country?.name === 'Spain', 'country name resolved');
assert(resolved.city?.name === 'Barcelona', 'city name resolved');
assert(
  resolved.treatment?.slug === slugify('IVF — In Vitro Fertilisation'),
  'treatment canonical slug',
);
assert(resolved.treatment?.name === 'IVF — In Vitro Fertilisation', 'treatment name');

// Invalid country dropped
const invalid = resolveEntitiesAgainstMaps(
  { country: { slug: 'unknown', name: 'unknown' } },
  maps,
);
assert(!invalid.country, 'invalid country dropped');

// City without country infers parent country
const cityOnly = resolveEntitiesAgainstMaps(
  { city: { slug: 'barcelona', name: 'barcelona' } },
  maps,
);
assert(cityOnly.city?.slug === 'barcelona', 'city only resolved');
assert(cityOnly.country?.slug === 'spain', 'city infers country');

// City in wrong country dropped
const mismatch = resolveEntitiesAgainstMaps(
  {
    country: { slug: 'greece', name: 'greece' },
    city: { slug: 'barcelona', name: 'barcelona' },
  },
  maps,
);
assert(mismatch.country?.slug === 'greece', 'greece kept');
assert(!mismatch.city, 'barcelona dropped for greece');

console.log('entity-resolver.spec.ts: all assertions passed');
