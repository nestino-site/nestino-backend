#!/usr/bin/env node
/** Fetch all clinic IDs with per-page retry and incremental save. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'https://nestino-backend-production.up.railway.app/api/v1';
const OUT = process.env.IDS_FILE ?? '/tmp/clinic-ids.json';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD required');

  const login = await fetch(`${BASE}/identity/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { accessToken } = await login.json();

  let ids = [];
  let cursor = undefined;
  if (existsSync(OUT)) {
    ids = JSON.parse(readFileSync(OUT, 'utf8'));
    if (ids.length > 0) cursor = ids[ids.length - 1];
    console.log(`Resuming from id cursor ${cursor}, have ${ids.length} ids`);
  }

  let page = 0;
  for (;;) {
    page++;
    let data;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const url = new URL(`${BASE}/clinics`);
        url.searchParams.set('limit', '100');
        if (cursor) url.searchParams.set('cursor', String(cursor));
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        break;
      } catch (err) {
        console.warn(`page ${page} attempt ${attempt} failed:`, err.message ?? err);
        await sleep(3000 * attempt);
      }
    }
    if (!data) throw new Error(`Failed to fetch page ${page}`);

    const newItems = (data.items ?? []).map((c) => c.id);
    const fresh = newItems.filter((id) => !ids.includes(id));
    ids.push(...fresh);
    writeFileSync(OUT, JSON.stringify(ids));
    console.log(`page ${page}: +${fresh.length} → total ${ids.length}`);

    if (!data.hasNextPage || !data.nextCursor) break;
    cursor = data.nextCursor;
    await sleep(1000);
  }

  console.log(`\nDone: ${ids.length} clinic IDs saved to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
