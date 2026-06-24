#!/usr/bin/env node
/**
 * Production: batch-upload clinic photos to Cloudinary via admin API.
 *
 *   BASE_URL=https://nestino-backend-production.up.railway.app/api/v1 \
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   node scripts/backfill-clinic-photo-cdn-production.mjs
 *
 * Optional: BATCH_SIZE=25  START_ID=1  END_ID=700  DRY_RUN=1
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'https://nestino-backend-production.up.railway.app/api/v1';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === '1';
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 25);
const START_ID = process.env.START_ID ? Number(process.env.START_ID) : 1;
const END_ID = process.env.END_ID ? Number(process.env.END_ID) : 700;
const PROGRESS_FILE = process.env.PROGRESS_FILE ?? '/tmp/backfill-photo-cdn-progress.json';
const IDS_FILE = process.env.IDS_FILE ?? '/tmp/clinic-ids.json';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { uploaded: 0, skipped: 0, failed: 0, lastId: START_ID - 1 };
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { uploaded: 0, skipped: 0, failed: 0, lastId: START_ID - 1 };
  }
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function login() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
  }
  const res = await fetch(`${BASE}/identity/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.accessToken ?? data.access_token ?? data.token;
  if (!token) throw new Error('Login response missing access token');
  return token;
}

async function fetchClinicIds(token) {
  if (existsSync(IDS_FILE)) {
    const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
    if (Array.isArray(ids) && ids.length) return ids;
  }

  const ids = [];
  let cursor;
  for (;;) {
    const url = new URL(`${BASE}/clinics`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', String(cursor));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`List clinics failed HTTP ${res.status}`);
    const data = await res.json();
    for (const c of data.items ?? []) ids.push(c.id);
    if (!data.hasNextPage || !data.nextCursor) break;
    cursor = data.nextCursor;
    await sleep(300);
  }
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
  return ids;
}

async function backfillBatch(token, ids) {
  const res = await fetch(`${BASE}/clinics/backfill-photos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(600_000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const err = new Error(`Backfill batch failed HTTP ${res.status}: ${JSON.stringify(data)}`);
    err.data = data;
    throw err;
  }
  return data;
}

async function main() {
  console.log(`Target: ${BASE}`);
  console.log(`Batch size: ${BATCH_SIZE}, ID range: ${START_ID}-${END_ID}`);

  const token = await login();
  console.log('Admin login OK');

  const allIds = (await fetchClinicIds(token))
    .filter((id) => id >= START_ID && id <= END_ID)
    .sort((a, b) => a - b);

  const progress = loadProgress();
  const pending = allIds.filter((id) => id > (progress.lastId ?? START_ID - 1));
  console.log(`Clinics to process: ${pending.length} (${allIds.length} total in range)`);

  if (DRY_RUN) {
    console.log('DRY_RUN=1 — first batch would be:', pending.slice(0, BATCH_SIZE));
    return;
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const label = `batch ${Math.floor(i / BATCH_SIZE) + 1} (ids ${batch[0]}-${batch[batch.length - 1]})`;
    console.log(`\n→ ${label}...`);
    const started = Date.now();

    let data;
    try {
      data = await backfillBatch(token, batch);
    } catch (err) {
      console.error(`${label} error:`, err.message);
      if (err.data?.message?.includes('GOOGLE_PLACES_API_KEY')) {
        console.error('\nSet GOOGLE_PLACES_API_KEY on Railway and redeploy.');
        process.exit(1);
      }
      await sleep(10_000);
      data = await backfillBatch(token, batch);
    }

    progress.uploaded += data.uploaded ?? 0;
    progress.skipped += data.skipped ?? 0;
    progress.failed += data.failed ?? 0;
    progress.lastId = batch[batch.length - 1];
    saveProgress(progress);

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `  done in ${elapsed}s — uploaded=${data.uploaded} skipped=${data.skipped} failed=${data.failed}`,
    );
    if (data.failures?.length) {
      console.log('  failures:', JSON.stringify(data.failures.slice(0, 5)));
    }

    await sleep(1000);
  }

  console.log('\n=== Complete ===', JSON.stringify(progress, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
