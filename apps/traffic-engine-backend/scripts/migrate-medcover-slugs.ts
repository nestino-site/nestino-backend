/**
 * One-time MedCover slug migration (site medcover.io).
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-medcover-slugs.ts [--dry-run] [--republish]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PageStatus, PrismaClient } from '@prisma/client';

const SITE_DOMAIN = process.env.CLINIC_SITE_DOMAIN ?? 'medcover.io';
const DRY_RUN = process.argv.includes('--dry-run');
const REPUBLISH = process.argv.includes('--republish');

type RedirectMap = Record<string, string>;

const RULES: Array<{
  name: string;
  test: RegExp;
  transform: (match: RegExpMatchArray) => string | null;
}> = [
  {
    name: 'costs-year',
    test: /^\/costs\/([^/]+)-ivf-cost-\d{4}\/?$/,
    transform: (m) => `/cost/ivf/${m[1]}/`,
  },
  {
    name: 'compare-ivf',
    test: /^\/compare\/([^/]+)-vs-([^/]+)-ivf\/?$/,
    transform: (m) => `/compare/${m[1]}-vs-${m[2]}-for-ivf/`,
  },
  {
    name: 'guides-flatten',
    test: /^\/guides\/[^/]+\/(.+-ivf-guide)\/?$/,
    transform: (m) => `/guides/${m[1]}/`,
  },
  {
    name: 'clinic-treatment-remove',
    test: /^\/clinics\/treatment\/([^/]+)\/?$/,
    transform: (m) => `/treatments/${m[1]}/`,
  },
  {
    name: 'cities-to-clinics',
    test: /^\/cities\/([^/]+)\/([^/]+)\/?$/,
    transform: (m) => `/clinics/${m[1]}/${m[2]}/`,
  },
  {
    name: 'treatment-costs',
    test: /^\/treatments\/([^/]+)\/costs\/?$/,
    transform: (m) => `/cost/${m[1]}/`,
  },
];

function normalizePath(slug: string): string {
  const trimmed = slug.trim();
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

async function main() {
  const prisma = new PrismaClient();
  const redirects: RedirectMap = {};

  try {
    const site = await prisma.site.findUnique({ where: { domain: SITE_DOMAIN } });
    if (!site) {
      throw new Error(`Site ${SITE_DOMAIN} not found`);
    }

    const pages = await prisma.page.findMany({
      where: { siteId: site.id },
      select: {
        id: true,
        slug: true,
        status: true,
        publishedAt: true,
        pipelineStatus: true,
        keywordId: true,
      },
    });

    console.log(`Found ${pages.length} pages for ${SITE_DOMAIN}`);

    const republishIds: number[] = [];

    for (const page of pages) {
      const oldSlug = normalizePath(page.slug);
      let newSlug: string | null = null;

      for (const rule of RULES) {
        const match = oldSlug.replace(/\/$/, '').match(rule.test) ?? oldSlug.match(rule.test);
        if (match) {
          newSlug = rule.transform(match);
          if (newSlug) newSlug = normalizePath(newSlug);
          console.log(`[${rule.name}] ${oldSlug} -> ${newSlug}`);
          break;
        }
      }

      if (!newSlug || newSlug === oldSlug) continue;

      redirects[oldSlug] = newSlug;

      if (DRY_RUN) continue;

      await prisma.page.update({
        where: { id: page.id },
        data: { slug: newSlug.replace(/\/$/, '') || newSlug },
      });

      const keyword = await prisma.keyword.findUnique({ where: { id: page.keywordId } });
      if (keyword) {
        await prisma.keyword.update({
          where: { id: keyword.id },
          data: { targetUrl: newSlug.replace(/\/$/, '') },
        });
      }

      if (page.status === PageStatus.PUBLISHED) {
        republishIds.push(page.id);
      }
    }

    if (REPUBLISH && republishIds.length > 0 && !DRY_RUN) {
      console.log(`Marking ${republishIds.length} migrated pages for re-publish (NEEDS_UPDATE)...`);
      await prisma.page.updateMany({
        where: { id: { in: republishIds } },
        data: { status: PageStatus.NEEDS_UPDATE },
      });
      console.log('Re-publish via admin or POST /api/v1/pages/:id/publish for each affected page.');
    }

    const outputDir = join(__dirname, 'output');
    mkdirSync(outputDir, { recursive: true });
    const outputPath = join(outputDir, 'medcover-slug-redirects.json');
    writeFileSync(outputPath, JSON.stringify(redirects, null, 2));
    console.log(`Wrote ${Object.keys(redirects).length} redirects to ${outputPath}`);

    if (DRY_RUN) {
      console.log('Dry run — no database changes applied.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
