/**
 * Phase 3: Backfill HTML internal links for all existing PUBLISHED pages.
 *
 * Usage:
 *   # Dry-run (default — no DB writes, prints per-page + aggregate SEO report)
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-internal-linking.ts --dry-run
 *
 *   # Live run (updates Page.htmlContent for pages where report.passed is true)
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-internal-linking.ts --apply
 *
 * Optional filters:
 *   --site=medcover.io    (default: medcover.io)
 *   --language=EN         (default: all languages)
 *   --limit=50            (max pages to process, default: all)
 *   --batch=25            (DB batch size, default: 25)
 *
 * Run --dry-run first, review the aggregate report, then --apply.
 */
import { PageStatus, PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import { injectInternalLinks } from '../src/modules/traffic-engine/publishing/html-internal-linking/html-link-injector';
import { buildSeoReport } from '../src/modules/traffic-engine/publishing/html-internal-linking/internal-linking-seo.report';
import { ArticleKeywordExtractorService } from '../src/modules/traffic-engine/publishing/html-internal-linking/article-keyword-extractor.service';
import { LinkTargetRepository } from '../src/modules/traffic-engine/publishing/html-internal-linking/link-target.repository';
import { OpenModelClient } from '../src/modules/clinic-inventory/clinics/enrichment/llm/openmodel.client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { SeoLinkingReport } from '../src/modules/traffic-engine/publishing/html-internal-linking/html-internal-linking.types';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const siteDomain = (args.find((a) => a.startsWith('--site='))?.split('=')[1]) ?? 'www.medcover.io';
const language = args.find((a) => a.startsWith('--language='))?.split('=')[1];
const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
const batchArg = args.find((a) => a.startsWith('--batch='))?.split('=')[1];
const MAX_PAGES = limitArg ? parseInt(limitArg, 10) : Infinity;
const BATCH_SIZE = batchArg ? parseInt(batchArg, 10) : 25;
const MAX_LINKS = 4;

// ---------------------------------------------------------------------------
// Setup (manual DI — same pattern as other backfill scripts)
// ---------------------------------------------------------------------------
const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;

const llmClient = new OpenModelClient();
const extractor = new ArticleKeywordExtractorService(llmClient);
const repo = new LinkTargetRepository(prismaService);

// ---------------------------------------------------------------------------
// Types for aggregate stats
// ---------------------------------------------------------------------------
interface PageResult {
  pageId: number;
  slug: string;
  linksInjected: number;
  report: SeoLinkingReport;
  skippedReason?: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== HTML Internal Linking Backfill ===`);
  console.log(`  mode     : ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY (will write to DB)'}`);
  console.log(`  site     : ${siteDomain}`);
  console.log(`  language : ${language ?? 'all'}`);
  console.log(`  limit    : ${MAX_PAGES === Infinity ? 'all' : MAX_PAGES}`);
  console.log(`  batch    : ${BATCH_SIZE}`);
  console.log();

  const site = await prisma.site.findFirst({ where: { domain: siteDomain } });
  if (!site) {
    console.error(`Site not found for domain: ${siteDomain}`);
    process.exit(1);
  }

  const whereFilter = {
    siteId: site.id,
    status: PageStatus.PUBLISHED,
    htmlContent: { not: null as null },
    ...(language ? { language: language as never } : {}),
  };

  const totalCount = await prisma.page.count({ where: whereFilter });
  const toProcess = Math.min(totalCount, MAX_PAGES === Infinity ? totalCount : MAX_PAGES);
  console.log(`Found ${totalCount} published pages — processing ${toProcess}\n`);

  const results: PageResult[] = [];
  let processed = 0;
  let cursor: number | undefined;

  while (processed < toProcess) {
    const batch = await prisma.page.findMany({
      where: {
        ...whereFilter,
        ...(cursor !== undefined ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, slug: true, htmlContent: true },
      orderBy: { id: 'asc' },
      take: Math.min(BATCH_SIZE, toProcess - processed),
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;

    for (const page of batch) {
      const html = page.htmlContent ?? '';
      if (!html.trim()) {
        results.push({
          pageId: page.id,
          slug: page.slug,
          linksInjected: 0,
          report: buildSeoReport('', [], []),
          skippedReason: 'empty_html',
        });
        processed++;
        continue;
      }

      try {
        const keywords = await extractor.extract(html);
        if (keywords.length === 0) {
          results.push({
            pageId: page.id,
            slug: page.slug,
            linksInjected: 0,
            report: buildSeoReport('', [], []),
            skippedReason: 'no_keywords',
          });
          processed++;
          continue;
        }

        const targets = await repo.findPublishedTargets(
          site.id,
          page.id,
          keywords,
          siteDomain,
          MAX_LINKS,
        );

        if (targets.length === 0) {
          results.push({
            pageId: page.id,
            slug: page.slug,
            linksInjected: 0,
            report: buildSeoReport('', [], []),
            skippedReason: 'no_targets',
          });
          processed++;
          continue;
        }

        const { html: linkedHtml, injectedLinks } = injectInternalLinks({
          html,
          targets,
          maxLinks: MAX_LINKS,
        });

        const report = buildSeoReport(linkedHtml, injectedLinks, targets);

        const status = report.passed
          ? (dryRun ? '[DRY-RUN] ✓' : '✓')
          : '✗ (report failed — skipped)';

        console.log(
          `  page ${page.id} ${page.slug} → ${injectedLinks.length} links | score=${report.score} ${status}`,
        );
        if (report.issues.length > 0) {
          report.issues.forEach((issue) => console.log(`    ⚠ ${issue}`));
        }

        if (!dryRun && report.passed && injectedLinks.length > 0) {
          await prisma.page.update({
            where: { id: page.id },
            data: { htmlContent: linkedHtml },
          });
        }

        results.push({
          pageId: page.id,
          slug: page.slug,
          linksInjected: report.passed ? injectedLinks.length : 0,
          report,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  page ${page.id} ${page.slug} → ERROR: ${msg}`);
        results.push({
          pageId: page.id,
          slug: page.slug,
          linksInjected: 0,
          report: buildSeoReport('', [], []),
          skippedReason: `error:${msg.slice(0, 80)}`,
        });
      }

      processed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Aggregate report
  // ---------------------------------------------------------------------------
  const passed = results.filter((r) => r.report.passed && r.linksInjected > 0);
  const failed = results.filter((r) => !r.report.passed && !r.skippedReason);
  const skipped = results.filter((r) => r.skippedReason);
  const totalLinksInjected = results.reduce((acc, r) => acc + r.linksInjected, 0);
  const avgScore =
    passed.length > 0
      ? Math.round(passed.reduce((acc, r) => acc + r.report.score, 0) / passed.length)
      : 0;

  console.log('\n=== Aggregate Report ===');
  console.log(`  Total processed  : ${results.length}`);
  console.log(`  Passed + linked  : ${passed.length}`);
  console.log(`  Failed (report)  : ${failed.length}`);
  console.log(`  Skipped          : ${skipped.length}`);
  console.log(`  Total links      : ${totalLinksInjected} ${dryRun ? '(proposed)' : '(written)'}`);
  console.log(`  Avg SEO score    : ${avgScore}/100`);

  if (failed.length > 0) {
    console.log('\n  Pages that failed the SEO report:');
    failed.slice(0, 20).forEach((r) => {
      console.log(`    - page ${r.pageId} ${r.slug}: ${r.report.issues.join('; ')}`);
    });
  }

  if (dryRun) {
    console.log('\n  Run with --apply to commit the changes.');
  } else {
    console.log('\n  Done. Links written to database.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
