import { GscStrategistInputBuilder, GscStrategistQueryCandidate } from './gsc-strategist-input.builder';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function testAggregateByQuery(): void {
  const builder = new GscStrategistInputBuilder({} as never);
  const aggregated = builder.aggregateByQuery([
    {
      query: 'hair transplant turkey cost',
      impressions: 200,
      clicks: 4,
      ctr: 0.02,
      avgPosition: 8,
      pageId: 1,
      page: { id: 1, slug: '/guides/turkey-hair-restoration-guide/', title: 'Turkey Hair Guide' },
    },
    {
      query: 'hair transplant turkey cost',
      impressions: 100,
      clicks: 2,
      ctr: 0.02,
      avgPosition: 10,
      pageId: 1,
      page: { id: 1, slug: '/guides/turkey-hair-restoration-guide/', title: 'Turkey Hair Guide' },
    },
  ]);

  const row = aggregated.get('hair transplant turkey cost');
  assert(row, 'expected aggregated row');
  assert(row.impressions === 300, `expected 300 impressions, got ${row.impressions}`);
  assert(row.clicks === 6, `expected 6 clicks, got ${row.clicks}`);
  assert(Math.abs(row.avgPosition - 8.666) < 0.01, `unexpected avgPosition ${row.avgPosition}`);
  assert(row.isOrphan === true, 'query should be orphan on non-dedicated page');
}

function testEligibilityFilters(): void {
  const builder = new GscStrategistInputBuilder({} as never);
  const eligible: GscStrategistQueryCandidate = {
    query: 'fue vs dhi',
    impressions: 500,
    clicks: 5,
    ctr: 0.01,
    avgPosition: 12,
    ctrGap: -0.02,
    pageId: null,
    pageSlug: null,
    pageTitle: null,
    isOrphan: true,
    hasDedicatedPage: false,
  };

  assert(
    builder.isEligibleCandidate(eligible, {
      minImpressions: 50,
      minPosition: 5,
      maxPosition: 30,
      brandTerms: ['medcover'],
    }),
    'eligible orphan should pass',
  );

  assert(
    builder.isBrandedQuery('medcover reviews', ['medcover']),
    'branded query should be detected',
  );
  assert(
    !builder.isBrandedQuery('fue vs dhi turkey', ['medcover']),
    'non-branded query should pass',
  );
}

testAggregateByQuery();
testEligibilityFilters();
console.log('gsc-strategist-input.builder.spec.ts: all tests passed');
