import assert from 'node:assert/strict';
import {
  collectDeterministicSeoIssues,
  ensureKeywordInH1,
  extractH1Text,
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

  console.log('seo-gate.utils.spec: all assertions passed');
}

run();
