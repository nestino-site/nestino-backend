/**
 * Local backfill: link DENTAL + emit clinic publish (uses fixed site-domain lookup).
 *
 *   DATABASE_URL="postgresql://..." \
 *   CLOUDINARY_URL="..." \
 *   GOOGLE_PLACES_API_KEY="..." \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-dental-clinic-pages-local.ts
 *
 * Optional: ONLY_CITIES=istanbul,barcelona DRY_RUN=1
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ClinicPublishBridge } from '../src/modules/clinic-inventory/clinic-publish.bridge';

const CITIES = (
  process.env.ONLY_CITIES?.split(/[,\s]+/).filter(Boolean) ?? [
    'alicante', 'ankara', 'athens', 'barcelona', 'brno', 'istanbul', 'lisbon',
    'madrid', 'porto', 'prague', 'skopje', 'thessaloniki', 'valencia',
  ]
);

const HAIR_TERMS = ['hair', 'capilar', 'trasplant', 'fue', 'sac-ekim', 'tricholog', 'injerto', 'pelo', 'graft'];
const IVF_TERMS = ['ivf', 'fertil', 'reproduc', 'tup-bebek', 'embryo', 'ovul', 'insemin'];
const DENTAL_TERMS = ['dental', 'dentist', 'dentistry', 'odontolog', 'stomatolog', 'zahn', 'diş', 'veneer'];

function isDentalCandidate(name: string, slug: string): boolean {
  const text = `${name} ${slug}`.toLowerCase();
  if (HAIR_TERMS.some((t) => text.includes(t))) return false;
  if (IVF_TERMS.some((t) => text.includes(t)) && !text.includes('dental') && !text.includes('dentist')) {
    return false;
  }
  return DENTAL_TERMS.some((t) => text.includes(t));
}

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === '1';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  const bridge = app.get(ClinicPublishBridge);

  const dental = await prisma.treatment.findUnique({ where: { code: 'DENTAL' } });
  if (!dental) throw new Error('DENTAL treatment not found — run seed-dental-production.sh ensure_treatment first');

  const clinicIds = new Set<number>();

  for (const citySlug of CITIES) {
    const city = await prisma.city.findUnique({ where: { slug: citySlug } });
    if (!city) {
      console.warn(`skip unknown city ${citySlug}`);
      continue;
    }

    const linked = await prisma.clinic.findMany({
      where: {
        status: 'PUBLISHED',
        cityId: city.id,
        treatments: { some: { treatmentId: dental.id, isOffered: true } },
      },
      select: { id: true },
    });
    linked.forEach((c) => clinicIds.add(c.id));

    const all = await prisma.clinic.findMany({
      where: { status: 'PUBLISHED', cityId: city.id },
      select: { id: true, name: true, slug: true },
    });
    for (const c of all) {
      if (isDentalCandidate(c.name, c.slug)) clinicIds.add(c.id);
    }
    console.log(`${city.name}: ${[...clinicIds].length} candidates so far`);
  }

  console.log(`Processing ${clinicIds.size} clinics (dryRun=${dryRun})`);
  let ok = 0;
  let fail = 0;

  for (const clinicId of [...clinicIds].sort((a, b) => a - b)) {
    try {
      if (!dryRun) {
        await prisma.clinicTreatment.upsert({
          where: { clinicId_treatmentId: { clinicId, treatmentId: dental.id } },
          create: { clinicId, treatmentId: dental.id, isOffered: true },
          update: { isOffered: true },
        });
        await bridge.emitClinicPublished(clinicId);
      }
      ok += 1;
      if (ok % 10 === 0) console.log(`progress ${ok}/${clinicIds.size}`);
    } catch (err) {
      fail += 1;
      console.error(`FAIL clinic ${clinicId}:`, err);
    }
  }

  console.log(`Done ok=${ok} fail=${fail}`);
  await app.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
