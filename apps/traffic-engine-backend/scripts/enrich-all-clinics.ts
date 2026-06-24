/**
 * Batch AI enrichment + publish for all clinics with a city assigned.
 *
 * Local (direct Nest):
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/enrich-all-clinics.ts
 *
 * Remote production API:
 *   BASE_URL=https://nestino-backend-production.up.railway.app/api/v1 \
 *   ADMIN_EMAIL=admin@... ADMIN_PASSWORD=... \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/enrich-all-clinics.ts --remote
 *
 * Optional: ONLY_IDS=1,2 DRY_RUN=1
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ClinicEnrichmentService } from '../src/modules/clinic-inventory/clinics/enrichment/clinic-enrichment.service';
import { buildEnrichmentInput } from '../src/modules/clinic-inventory/clinics/enrichment/clinic-enrichment.mapper';
import { ClinicsService } from '../src/modules/clinic-inventory/clinics/services/clinics.service';

const CLINIC_DETAIL_INCLUDE = {
  city: { include: { country: true } },
  country: true,
  treatments: { include: { treatment: true } },
  accreditations: { include: { accreditation: true } },
} as const;

interface ResultRow {
  id: number;
  name: string;
  status: 'ok' | 'fail' | 'skip';
  durationMs?: number;
  seoTitle?: string;
  overviewWords?: number;
  faqsCount?: number;
  error?: string;
}

async function runRemote(clinicIds: number[], dryRun: boolean): Promise<ResultRow[]> {
  const base = process.env.BASE_URL ?? 'https://nestino-backend-production.up.railway.app/api/v1';
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD required for --remote mode');
  }

  const loginRes = await fetch(`${base}/identity/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const { accessToken } = (await loginRes.json()) as { accessToken: string };

  const results: ResultRow[] = [];
  for (const id of clinicIds) {
    const start = Date.now();
    try {
      if (dryRun) {
        results.push({ id, name: `clinic-${id}`, status: 'skip' });
        continue;
      }
      const path = `${base}/clinics/${id}/enrich-and-publish`;
      const res = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = (await res.json()) as {
        enrichment?: {
          seoMeta?: { title?: string };
          clinicOverview?: string;
          localFaqs?: unknown[];
        };
        message?: string;
      };
      if (!res.ok) {
        results.push({
          id,
          name: `clinic-${id}`,
          status: 'fail',
          durationMs: Date.now() - start,
          error: body.message ?? `HTTP ${res.status}`,
        });
        continue;
      }
      const enrichment = body.enrichment;
      results.push({
        id,
        name: enrichment?.seoMeta?.title?.split('|')[0]?.trim() ?? `clinic-${id}`,
        status: 'ok',
        durationMs: Date.now() - start,
        seoTitle: enrichment?.seoMeta?.title,
        overviewWords: enrichment?.clinicOverview?.split(/\s+/).length,
        faqsCount: enrichment?.localFaqs?.length,
      });
      console.log(`✓ [${id}] ${enrichment?.seoMeta?.title} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    } catch (err) {
      results.push({
        id,
        name: `clinic-${id}`,
        status: 'fail',
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`✗ [${id}] ${String(err)}`);
    }
  }
  return results;
}

async function runLocal(clinicIds: number[], dryRun: boolean): Promise<ResultRow[]> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);
  const enrichment = app.get(ClinicEnrichmentService);
  const clinics = app.get(ClinicsService);

  const results: ResultRow[] = [];

  for (const id of clinicIds) {
    const start = Date.now();
    try {
      const clinic = await prisma.clinic.findUnique({
        where: { id },
        include: CLINIC_DETAIL_INCLUDE,
      });
      if (!clinic) {
        results.push({ id, name: '?', status: 'fail', error: 'not found' });
        continue;
      }
      if (!clinic.cityId || !clinic.city) {
        results.push({ id, name: clinic.name, status: 'skip', error: 'no city' });
        console.warn(`skip [${id}] ${clinic.name} — no city`);
        continue;
      }

      if (dryRun) {
        results.push({ id, name: clinic.name, status: 'skip' });
        console.log(`dry-run [${id}] ${clinic.name}`);
        continue;
      }

      const input = buildEnrichmentInput(clinic);
      const result = await enrichment.enrichAndPublish(input, id);
      results.push({
        id,
        name: clinic.name,
        status: 'ok',
        durationMs: Date.now() - start,
        seoTitle: result.enrichment.seoMeta.title,
        overviewWords: result.enrichment.clinicOverview.split(/\s+/).length,
        faqsCount: result.enrichment.localFaqs.length,
      });
      console.log(
        `✓ [${id}] ${clinic.name} — ${result.enrichment.seoMeta.title} (${((Date.now() - start) / 1000).toFixed(1)}s)`,
      );
      void clinics;
    } catch (err) {
      results.push({
        id,
        name: `clinic-${id}`,
        status: 'fail',
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`✗ [${id}] ${String(err)}`);
    }
  }

  await app.close();
  return results;
}

async function main(): Promise<void> {
  const remote = process.argv.includes('--remote');
  const dryRun = process.env.DRY_RUN === '1';
  const onlyIds = process.env.ONLY_IDS?.split(/[,\s]+/).map(Number).filter(Boolean);

  let clinicIds: number[];

  if (remote) {
    if (onlyIds?.length) {
      clinicIds = onlyIds;
    } else {
      const base = process.env.BASE_URL ?? 'https://nestino-backend-production.up.railway.app/api/v1';
      const email = process.env.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD;
      if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD required');
      const loginRes = await fetch(`${base}/identity/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const { accessToken } = (await loginRes.json()) as { accessToken: string };
      const listRes = await fetch(`${base}/clinics?limit=100`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const list = (await listRes.json()) as { items?: { id: number }[] };
      clinicIds = (list.items ?? []).map((c) => c.id);
    }
  } else {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    const prisma = app.get(PrismaService);
    const clinics = await prisma.clinic.findMany({
      where: onlyIds?.length ? { id: { in: onlyIds } } : { cityId: { not: null } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    clinicIds = clinics.map((c) => c.id);
    await app.close();
  }

  console.log(`\nEnriching ${clinicIds.length} clinics (remote=${remote}, dryRun=${dryRun})\n`);

  const results = remote
    ? await runRemote(clinicIds, dryRun)
    : await runLocal(clinicIds, dryRun);

  const ok = results.filter((r) => r.status === 'ok');
  const fail = results.filter((r) => r.status === 'fail');
  const skip = results.filter((r) => r.status === 'skip');
  const avgMs = ok.length
    ? Math.round(ok.reduce((s, r) => s + (r.durationMs ?? 0), 0) / ok.length)
    : 0;

  console.log('\n══════════════════════════════════════');
  console.log('BATCH ENRICHMENT SUMMARY');
  console.log('══════════════════════════════════════');
  console.log(`Total:   ${results.length}`);
  console.log(`Success: ${ok.length}`);
  console.log(`Failed:  ${fail.length}`);
  console.log(`Skipped: ${skip.length}`);
  console.log(`Avg time:${(avgMs / 1000).toFixed(1)}s per clinic`);
  console.log('');

  for (const r of results) {
    if (r.status === 'ok') {
      console.log(
        `  ✓ [${r.id}] ${r.name} | title: ${r.seoTitle} | ${r.overviewWords}w | ${r.faqsCount} FAQs | ${((r.durationMs ?? 0) / 1000).toFixed(1)}s`,
      );
    } else if (r.status === 'fail') {
      console.log(`  ✗ [${r.id}] ${r.name} | ${r.error}`);
    }
  }

  if (fail.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
