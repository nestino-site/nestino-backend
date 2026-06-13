/**
 * Set robotsMeta to "index, follow" for all published clinic PDP pages.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-clinic-robots-index.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-clinic-robots-index.ts --site=medcover.io
 */
import { PageStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const siteArg = process.argv.find((a) => a.startsWith('--site='));
const siteDomain = siteArg?.split('=')[1] ?? 'medcover.io';
const INDEX_ROBOTS = 'index, follow';

async function main() {
  const site = await prisma.site.findFirst({ where: { domain: siteDomain } });
  if (!site) {
    console.error(`Site not found for domain: ${siteDomain}`);
    process.exit(1);
  }

  const pages = await prisma.page.findMany({
    where: {
      siteId: site.id,
      status: PageStatus.PUBLISHED,
      pageType: 'clinic_pdp',
      robotsMeta: { contains: 'noindex' },
    },
    select: { id: true, slug: true, robotsMeta: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Found ${pages.length} clinic pages with noindex on ${siteDomain}`);

  for (const page of pages) {
    console.log(
      `${dryRun ? '[dry-run] ' : ''}page ${page.id} ${page.slug}: ${page.robotsMeta} → ${INDEX_ROBOTS}`,
    );
    if (!dryRun) {
      await prisma.page.update({
        where: { id: page.id },
        data: { robotsMeta: INDEX_ROBOTS },
      });
    }
  }

  console.log(`Done. ${pages.length} ${dryRun ? 'would update' : 'updated'}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
