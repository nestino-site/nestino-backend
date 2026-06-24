#!/usr/bin/env node
/**
 * Production batch: enrich → apply → publish for all clinics.
 *
 *   BASE_URL=https://nestino-backend-production.up.railway.app/api/v1 \
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   node scripts/enrich-all-clinics-production.mjs
 *
 * Optional:
 *   ONLY_IDS=1,2,3   — process specific ids
 *   SKIP_IDS=1       — skip already-done ids
 *   START_ID=2       — skip ids below this value
 *   LIMIT=5          — cap total processed
 *   DRY_RUN=1
 *   PROGRESS_FILE=/tmp/enrich-progress.json  — resume + save after each success
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'https://nestino-backend-production.up.railway.app/api/v1';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY_IDS = process.env.ONLY_IDS?.split(/[,\s]+/).map(Number).filter(Boolean);
const SKIP_IDS = new Set(
  (process.env.SKIP_IDS?.split(/[,\s]+/).map(Number).filter(Boolean)) ?? [],
);
const START_ID = process.env.START_ID ? Number(process.env.START_ID) : undefined;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
const PROGRESS_FILE = process.env.PROGRESS_FILE ?? '/tmp/enrich-all-progress.json';
const IDS_FILE = process.env.IDS_FILE ?? '/tmp/clinic-ids.json';
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS ?? 5000);

function stripHtml(text) {
  return text
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(120_000) });
      if (res.status === 502 || res.status === 503 || res.status === 429) {
        lastErr = new Error(`${label} HTTP ${res.status}`);
        if (attempt < MAX_RETRIES) {
          console.warn(`  ↻ ${label} ${res.status} — retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s`);
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        console.warn(`  ↻ ${label} (${msg}) — retry ${attempt}/${MAX_RETRIES}`);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }
  throw lastErr;
}

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { done: [], failed: [] };
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { done: [], failed: [] };
  }
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function login() {
  if (!EMAIL || !PASSWORD) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD required');
  const res = await fetchWithRetry(
    `${BASE}/identity/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    },
    'login',
  );
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const { accessToken } = await res.json();
  return accessToken;
}

async function fetchAllClinicIds(token) {
  if (ONLY_IDS?.length) return ONLY_IDS;

  if (existsSync(IDS_FILE)) {
    const cached = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
    if (Array.isArray(cached) && cached.length > 0) {
      console.log(`Using cached clinic IDs from ${IDS_FILE} (${cached.length} clinics)`);
      return cached;
    }
  }

  const ids = [];
  let cursor = undefined;
  let page = 0;
  for (;;) {
    page++;
    const url = new URL(`${BASE}/clinics`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', String(cursor));
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } }, `list clinics p${page}`);
    if (!res.ok) throw new Error(`List clinics failed: ${res.status}`);
    const data = await res.json();
    for (const c of data.items ?? []) ids.push(c.id);
    console.log(`  listed page ${page}: +${(data.items ?? []).length} (total ${ids.length})`);
    if (!data.hasNextPage || !data.nextCursor) break;
    cursor = data.nextCursor;
    await sleep(500);
  }

  writeFileSync(IDS_FILE, JSON.stringify(ids));
  console.log(`Saved ${ids.length} clinic IDs to ${IDS_FILE}`);
  return ids;
}

async function processClinic(token, id) {
  const start = Date.now();
  const auth = { Authorization: `Bearer ${token}` };

  const combined = await fetchWithRetry(
    `${BASE}/clinics/${id}/enrich-and-publish`,
    { method: 'POST', headers: auth, signal: AbortSignal.timeout(180_000) },
    `enrich-and-publish ${id}`,
  );

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

  const enrichRes = await fetchWithRetry(
    `${BASE}/clinics/${id}/enrich`,
    { method: 'POST', headers: auth },
    `enrich ${id}`,
  );
  if (!enrichRes.ok) {
    const err = await enrichRes.json().catch(() => ({}));
    throw new Error(err.message ?? `enrich HTTP ${enrichRes.status}`);
  }
  const enrichment = await enrichRes.json();

  const patchRes = await fetchWithRetry(
    `${BASE}/clinics/${id}`,
    {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shortDescription: enrichment.seoMeta.description.slice(0, 500),
        longDescription: stripHtml(enrichment.clinicOverview),
        sourcePayload: { aiEnrichment: { ...enrichment, appliedAt: new Date().toISOString() } },
      }),
    },
    `patch ${id}`,
  );
  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    throw new Error(err.message ?? `patch HTTP ${patchRes.status}`);
  }

  const pubRes = await fetchWithRetry(
    `${BASE}/clinics/${id}/publish`,
    { method: 'POST', headers: auth },
    `publish ${id}`,
  );
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
  console.log(`DRY_RUN=${DRY_RUN} | PROGRESS_FILE=${PROGRESS_FILE}\n`);

  const progress = loadProgress();
  const doneSet = new Set(progress.done ?? []);

  const token = await login();
  let ids = await fetchAllClinicIds(token);

  ids = ids.filter((id) => {
    if (SKIP_IDS.has(id)) return false;
    if (START_ID !== undefined && id < START_ID) return false;
    if (doneSet.has(id)) return false;
    return true;
  });
  if (LIMIT) ids = ids.slice(0, LIMIT);

  console.log(`Processing ${ids.length} clinics (${doneSet.size} already done)\n`);

  const results = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const label = `[${i + 1}/${ids.length}] clinic ${id}`;

    if (DRY_RUN) {
      console.log(`${label} — skip (dry run)`);
      continue;
    }

    try {
      const r = await processClinic(token, id);
      results.push(r);
      progress.done = [...new Set([...(progress.done ?? []), id])];
      progress.failed = (progress.failed ?? []).filter((f) => f.id !== id);
      saveProgress(progress);
      console.log(
        `✓ ${label} | ${r.seoTitle} | ${r.overviewWords}w | ${r.faqsCount} FAQs | ${(r.durationMs / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id, status: 'fail', error: msg });
      progress.failed = [...(progress.failed ?? []).filter((f) => f.id !== id), { id, error: msg }];
      saveProgress(progress);
      console.error(`✗ ${label} | ${msg}`);
    }
  }

  const ok = results.filter((r) => r.status === 'ok');
  const fail = results.filter((r) => r.status === 'fail');
  const avg = ok.length ? ok.reduce((s, r) => s + r.durationMs, 0) / ok.length / 1000 : 0;

  console.log('\n══════════════════════════════════════');
  console.log('BATCH SUMMARY (this run)');
  console.log(`Success: ${ok.length} | Failed: ${fail.length} | Avg: ${avg.toFixed(1)}s`);
  console.log(`Total done (all runs): ${(progress.done ?? []).length}`);
  console.log('══════════════════════════════════════\n');

  if (fail.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
