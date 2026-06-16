import assert from 'node:assert/strict';
import {
  extractGuideGeoFromPage,
  filterSecondaryKeywordsByGeo,
  slugToDisplayName,
} from './guide-geo.util';

function run(): void {
  const istanbul = extractGuideGeoFromPage({
    slug: '/guides/turkey/istanbul-hair-restoration-guide',
    title: 'Hair Transplant in Istanbul: Clinics, Real Costs & Patient Insights',
  });
  assert.equal(istanbul.citySlug, 'istanbul');
  assert.equal(istanbul.countrySlug, 'turkey');
  assert.equal(istanbul.location, 'Istanbul, Turkey');
  assert.equal(istanbul.isCityGuide, true);
  assert.ok(istanbul.geoConstraint?.includes('Istanbul'));
  assert.ok(istanbul.geoConstraint?.includes('Turkey'));

  const madrid = extractGuideGeoFromPage({
    slug: '/guides/spain/madrid-hair-restoration-guide',
    title: 'Hair Transplant in Madrid: Clinics, Real Costs & Patient Insights',
  });
  assert.equal(madrid.citySlug, 'madrid');
  assert.equal(madrid.countrySlug, 'spain');
  assert.equal(madrid.location, 'Madrid, Spain');

  const spainCountry = extractGuideGeoFromPage({
    slug: '/guides/spain-hair-restoration-guide',
    title: 'Hair Transplant in Spain: Country Guide',
  });
  assert.equal(spainCountry.countrySlug, 'spain');
  assert.equal(spainCountry.isCityGuide, false);
  assert.ok(spainCountry.geoConstraint?.includes('Spain'));

  const filtered = filterSecondaryKeywordsByGeo(
    [
      'hair transplant barcelona',
      'hair transplant madrid',
      'fue spain',
      'hair transplant greece',
    ],
    madrid,
  );
  assert.deepEqual(filtered, ['hair transplant madrid', 'fue spain']);

  assert.equal(slugToDisplayName('hair-restoration'), 'Hair Restoration');

  console.log('guide-geo.util.spec: all assertions passed');
}

run();
