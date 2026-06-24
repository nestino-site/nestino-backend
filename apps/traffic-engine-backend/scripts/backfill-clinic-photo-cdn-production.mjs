#!/usr/bin/env node
/**
 * Production: upload clinic photos to Cloudinary via admin API.
 * Requires CLOUDINARY_URL already set on the Railway service.
 *
 *   BASE_URL=https://nestino-backend-production.up.railway.app/api/v1 \
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   node scripts/backfill-clinic-photo-cdn-production.mjs
 *
 * Optional: LIMIT=10  DRY_RUN=1  IDS=1,2,3
 */
const BASE = process.env.BASE_URL ?? 'https://nestino-backend-production.up.railway.app/api/v1';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
const IDS = process.env.IDS?.split(/[,\s]+/).map(Number).filter(Boolean);

async function login() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
  }
  const res = await fetch(`${BASE}/auth/login`, {
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
  const token = data.access_token ?? data.accessToken ?? data.token;
  if (!token) throw new Error('Login response missing access token');
  return token;
}

async function main() {
  console.log(`Target: ${BASE}`);
  if (DRY_RUN) console.log('DRY_RUN=1 — will only login and print payload');

  const token = await login();
  console.log('Admin login OK');

  const body = {};
  if (IDS?.length) body.ids = IDS;
  if (LIMIT) body.limit = LIMIT;

  if (DRY_RUN) {
    console.log('Would POST /clinics/backfill-photos with:', JSON.stringify(body));
    return;
  }

  console.log('Starting photo CDN backfill (this may take several minutes)...');
  const started = Date.now();
  const res = await fetch(`${BASE}/clinics/backfill-photos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3_600_000),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 500) };
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (!res.ok) {
    console.error(`Backfill failed HTTP ${res.status} (${elapsed}s):`, JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(`Backfill complete (${elapsed}s):`, JSON.stringify(data, null, 2));

  if (data.cloudinaryConfigured === false) {
    console.error('\nCLOUDINARY_URL is not set on production. Set it in Railway and redeploy first.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
