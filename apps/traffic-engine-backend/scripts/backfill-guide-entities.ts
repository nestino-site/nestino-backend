/**
 * Backfill pageType + entities + robotsMeta for published pages missing tags.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-guide-entities.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-guide-entities.ts --site=medcover.io
 */
import { PageStatus, PrismaClient } from '@prisma/client';
import { PageSeoEnricherService } from '../src/modules/traffic-engine/content-api/seo/page-seo-enricher.service';
import { EntityResolverService } from '../src/modules/traffic-engine/content-api/seo/entity-resolver.service';
import { SeoSchemaBuilderService } from '../src/modules/traffic-engine/content-api/seo/seo-schema-builder.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const siteArg = process.argv.find((a) => a.startsWith('--site='));
const siteDomain = siteArg?.split('=')[1] ?? 'medcover.io';

async function main() {
  const site = await prisma.site.findFirst({ where: { domain: siteDomain } });
  if (!site) {
    console.error(`Site not found for domain: ${siteDomain}`);
    process.exit(1);
  }

  const enricher = new PageSeoEnricherService(
    prisma as unknown as PrismaService,
    new SeoSchemaBuilderService(),
    new EntityResolverService(prisma as unknown as PrismaService),
  );

  const pages = await prisma.page.findMany({
    where: {
      siteId: site.id,
      status: PageStatus.PUBLISHED,
      OR: [{ pageType: null }, { entities: { equals: null } }],
    },
    select: { id: true, slug: true, pageType: true, entities: true, robotsMeta: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Found ${pages.length} pages to evaluate on ${siteDomain}`);

  let updated = 0;
  let skipped = 0;

  for (const page of pages) {
    const tags = await enricher.resolvePublishTags(page.slug);
    const entitiesEmpty =
      page.entities == null ||
      (typeof page.entities === 'object' &&
        !Array.isArray(page.entities) &&
        Object.keys(page.entities as object).length === 0);

    const patch: {
      pageType?: string;
      entities?: object;
      robotsMeta?: string;
    } = {};

    if (page.pageType == null) patch.pageType = tags.pageType;
    if (entitiesEmpty && Object.keys(tags.entities).length > 0) {
      patch.entities = tags.entities;
    }
    if (page.robotsMeta == null) patch.robotsMeta = tags.robotsMeta;

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    console.log(
      `${dryRun ? '[dry-run] ' : ''}page ${page.id} ${page.slug} → ${JSON.stringify(patch)}`,
    );

    if (!dryRun) {
      await prisma.page.update({ where: { id: page.id }, data: patch });
    }
    updated++;
  }

  console.log(`Done. ${updated} ${dryRun ? 'would update' : 'updated'}, ${skipped} skipped.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
