import assert from 'node:assert/strict';
import {
  clampMetaDescription,
  clampMetaTitle,
  collectDeterministicSeoIssues,
  contentAlignsWithPage,
  ensureKeywordInH1,
  extractH1Text,
  extractPageTopicTokens,
  h1ContainsKeyword,
} from './seo-gate.utils';

function run(): void {
  const content = '# Best Stays in Antalya\n\nBody text.';

  assert.equal(extractH1Text(content), 'Best Stays in Antalya');
  assert.equal(extractH1Text('## Only H2'), null);

  assert.equal(h1ContainsKeyword(content, 'antalya'), true);
  assert.equal(h1ContainsKeyword(content, 'istanbul hotels'), false);

  assert.equal(
    ensureKeywordInH1(content, 'villa silyan'),
    '# villa silyan: Best Stays in Antalya\n\nBody text.',
  );
  assert.equal(ensureKeywordInH1(content, 'antalya'), content);
  assert.equal(ensureKeywordInH1('No heading', 'keyword'), null);

  const h1Issues = collectDeterministicSeoIssues(content, 'villa silyan', {});
  assert.ok(h1Issues.includes('Primary keyword missing from H1'));

  const titleIssues = collectDeterministicSeoIssues(content, 'antalya', {
    metaTitle: 'Short',
  });
  assert.ok(titleIssues.some((i) => i.includes('Meta title length')));

  const descIssues = collectDeterministicSeoIssues(content, 'antalya', {
    metaDescription: 'Too short',
  });
  assert.ok(descIssues.some((i) => i.includes('Meta description length')));

  const longTitle =
    'IVF in Barcelona 2026 — Clinics, Real Costs & Verified Data | MedCover';
  assert.equal(longTitle.length, 70);
  const clampedTitle = clampMetaTitle(longTitle);
  assert.ok(clampedTitle.length >= 30 && clampedTitle.length <= 65);
  assert.ok(!clampedTitle.includes('| MedCover'));

  const longDesc = `${'word '.repeat(50)}`.trim();
  assert.ok(longDesc.length > 165);
  const clampedDesc = clampMetaDescription(longDesc);
  assert.ok(clampedDesc.length >= 80 && clampedDesc.length <= 165);

  const pragueSlug = '/compare/prague-vs-brno-ivf';
  const pragueKeyword = 'prague vs brno ivf';
  const greeceContent =
    '# IVF in Greece: Athens vs. Thessaloniki Clinic & Cost Guide (2026)\n\nAthens clinics...';
  const pragueContent =
    '# Prague vs Brno IVF: Clinic & Cost Comparison (2026)\n\nPrague and Brno fertility clinics...';

  assert.equal(contentAlignsWithPage(greeceContent, pragueKeyword, pragueSlug), false);
  assert.equal(contentAlignsWithPage(pragueContent, pragueKeyword, pragueSlug), true);
  assert.deepEqual(extractPageTopicTokens(pragueKeyword, pragueSlug).sort(), [
    'brno',
    'prague',
  ]);

  const madridSlug = '/guides/spain/madrid-hair-restoration-guide';
  const madridKeyword = 'hair transplant madrid';
  const barcelonaDraft =
    '# Hair Transplant in Barcelona: A Detailed Guide\n\nBarcelona clinics offer FUE and DHI.';
  const madridDraft =
    '# Hair Transplant in Madrid: Clinics & Costs\n\nMadrid clinics offer FUE and DHI.';

  assert.equal(contentAlignsWithPage(barcelonaDraft, madridKeyword, madridSlug), false);
  assert.equal(contentAlignsWithPage(madridDraft, madridKeyword, madridSlug), true);
  assert.deepEqual(
    extractPageTopicTokens(madridKeyword, madridSlug).sort(),
    ['madrid', 'spain'],
  );

  console.log('seo-gate.utils.spec: all assertions passed');
}

run();
