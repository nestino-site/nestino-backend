import {
  countryFlagEmoji,
  isTreatmentSlug,
  slugify,
  treatmentCodeFromSlug,
} from './slug.util';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(slugify('IVF & Fertility') === 'ivf-fertility', 'slugify treatment name');
assert(treatmentCodeFromSlug('egg-donation') === 'EGG_DONATION', 'treatment code from slug');
assert(treatmentCodeFromSlug('hair-restoration') === 'HAIR_RESTORATION', 'hair restoration code from slug');
assert(isTreatmentSlug('ivf', new Set(['ivf', 'icsi'])), 'isTreatmentSlug positive');
assert(!isTreatmentSlug('barcelona', new Set(['ivf'])), 'isTreatmentSlug negative');
assert(countryFlagEmoji('ES') === '🇪🇸', 'flag emoji ES');
assert(countryFlagEmoji('X') === null, 'flag emoji single char');
assert(countryFlagEmoji('123') === null, 'flag emoji numeric');

console.log('slug.util.spec.ts: all assertions passed');
