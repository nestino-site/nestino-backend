/**
 * Verifies treatment namespace guard rejects ivf as city slug.
 */
import { PrismaClient } from '@prisma/client';
import { TreatmentSlugGuard } from '../src/common/guards/treatment-slug.guard';

async function main() {
  const prisma = new PrismaClient();
  const guard = new TreatmentSlugGuard(prisma as never);

  const ivf = await prisma.treatment.findUnique({ where: { code: 'IVF' } });
  if (!ivf) {
    console.error('IVF treatment missing — run prisma db seed first');
    process.exit(1);
  }

  let rejected = false;
  try {
    await guard.assertNotTreatmentSlug('ivf', 'City');
  } catch (e) {
    rejected = true;
    console.log('PASS: ivf city slug rejected:', (e as Error).message);
  }

  if (!rejected) {
    console.error('FAIL: expected ivf city slug to be rejected');
    process.exit(1);
  }

  await guard.assertNotTreatmentSlug('barcelona', 'City');
  console.log('PASS: barcelona city slug allowed');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
