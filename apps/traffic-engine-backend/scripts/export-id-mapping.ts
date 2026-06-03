/**
 * Export cuid -> numeric id mappings after running the numeric_ids migration.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/export-id-mapping.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const sites = await prisma.$queryRaw<{ old_id: string; new_id: number }[]>`
      SELECT old_id, new_id FROM "_migration_site_map" ORDER BY new_id
    `;
    const pages = await prisma.$queryRaw<{ old_id: string; new_id: number }[]>`
      SELECT old_id, new_id FROM "_migration_page_map" ORDER BY new_id
    `;

    const siteMap = Object.fromEntries(sites.map((r) => [r.old_id, r.new_id]));
    const pageMap = Object.fromEntries(pages.map((r) => [r.old_id, r.new_id]));

    const out = {
      exportedAt: new Date().toISOString(),
      sites: siteMap,
      pages: pageMap,
    };

    const outPath = join(process.cwd(), 'id_mapping.json');
    writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`Wrote ${outPath} (${sites.length} sites, ${pages.length} pages)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
