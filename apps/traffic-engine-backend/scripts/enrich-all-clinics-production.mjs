#!/usr/bin/env node
/**
 * Production batch: enrich → apply → publish for all clinics.
 *
 *   BASE_URL=https://nestino-backend-production.up.railway.app/api/v1 \
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   node scripts/enrich-all-clinics-production.mjs
 *
 * Optional: ONLY_IDS=1,2,3  DRY_RUN=1  LIMIT=5
 */
const BASE = process.env.BASE_URL ?? 'https://nestino-backend-production.up.railway.app/api/v1';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY_IDS = process.env.ONLY_IDS?.split(/[,\s]+/).map(Number).filter(Boolean);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

function stripHtml(text) {
  return text
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function login() {
  if (!EMAIL || !PASSWORD) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD required');
  const res = await fetch(`${BASE}/identity/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const { accessToken } = await res.json();
  return accessToken;
}

async function fetchAllClinicIds(token) {
  if (ONLY_IDS?.length) return ONLY_IDS;

  const ids = [];
  let cursor = undefined;
  for (;;) {
    const url = new URL(`${BASE}/clinics`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', String(cursor));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`List clinics failed: ${res.status}`);
    const data = await res.json();
    const items = data.items ?? [];
    for (const c of items) ids.push(c.id);
    if (!data.hasNextPage || !data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return LIMIT ? ids.slice(0, LIMIT) : ids;
}

async function processClinic(token, id) {
  const start = Date.now();
  const auth = { Authorization: `Bearer ${token}` };

  // Prefer single endpoint if deployed
  const combined = await fetch(`${BASE}/clinics/${id}/enrich-and-publish`, {
    method: 'POST',
    headers: auth,
  });
  if (combined.ok) {
    const body = await combined.json();
    return {
      id,
      status: 'ok',
      mode: 'enrich-and-publish',
      durationMs: Date.now() - start,
      seoTitle: body.enrichment?.seoMeta?.title,
      overviewWords: body.enrichment?.clinicOverview?.split(/\s+/).length,
      faqsCount: body.enrichment?.localFaqs?.length,
    };
  }
  if (combined.status !== 404) {
    const err = await combined.json().catch(() => ({}));
    throw new Error(err.message ?? `enrich-and-publish HTTP ${combined.status}`);
  }

  // Fallback: enrich → patch → publish
  const enrichRes = await fetch(`${BASE}/clinics/${id}/enrich`, { method: 'POST', headers: auth });
  if (!enrichRes.ok) {
    const err = await enrichRes.json().catch(() => ({}));
    throw new Error(err.message ?? `enrich HTTP ${enrichRes.status}`);
  }
  const enrichment = await enrichRes.json();

  const patchRes = await fetch(`${BASE}/clinics/${id}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shortDescription: enrichment.seoMeta.description.slice(0, 500),
      longDescription: stripHtml(enrichment.clinicOverview),
      sourcePayload: {
        aiEnrichment: { ...enrichment, appliedAt: new Date().toISOString() },
      },
    }),
  });
  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    throw new Error(err.message ?? `patch HTTP ${patchRes.status}`);
  }

  const pubRes = await fetch(`${BASE}/clinics/${id}/publish`, { method: 'POST', headers: auth });
  if (!pubRes.ok) {
    const err = await pubRes.json().catch(() => ({}));
    throw new Error(err.message ?? `publish HTTP ${pubRes.status}`);
  }

  return {
    id,
    status: 'ok',
    mode: 'enrich+patch+publish',
    durationMs: Date.now() - start,
    seoTitle: enrichment.seoMeta?.title,
    overviewWords: enrichment.clinicOverview?.split(/\s+/).length,
    faqsCount: enrichment.localFaqs?.length,
  };
}

async function main() {
  console.log(`\n🔗 ${BASE}`);
  console.log(`DRY_RUN=${DRY_RUN}\n`);

  const token = await login();
  const ids = await fetchAllClinicIds(token);
  console.log(`Found ${ids.length} clinics to process\n`);

  const results = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const label = `[${i + 1}/${ids.length}] clinic ${id}`;
    if (DRY_RUN) {
      console.log(`${label} — skip (dry run)`);
      results.push({ id, status: 'skip' });
      continue;
    }
    try {
      const r = await processClinic(token, id);
      results.push(r);
      console.log(
        `✓ ${label} | ${r.seoTitle} | ${r.overviewWords}w | ${r.faqsCount} FAQs | ${(r.durationMs / 1000).toFixed(1)}s | ${r.mode}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id, status: 'fail', error: msg });
      console.error(`✗ ${label} | ${msg}`);
    }
  }

  const ok = results.filter((r) => r.status === 'ok');
  const fail = results.filter((r) => r.status === 'fail');
  const avg = ok.length ? ok.reduce((s, r) => s + r.durationMs, 0) / ok.length / 1000 : 0;

  console.log('\n══════════════════════════════════════');
  console.log('BATCH SUMMARY');
  console.log(`Success: ${ok.length} | Failed: ${fail.length} | Avg: ${avg.toFixed(1)}s`);
  console.log('══════════════════════════════════════\n');

  if (fail.length) {
    for (const f of fail) console.log(`  ✗ [${f.id}] ${f.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
