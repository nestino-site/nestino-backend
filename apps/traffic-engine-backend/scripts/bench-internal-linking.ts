/**
 * Single-page (or whole-site) performance benchmark for HTML internal linking.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/bench-internal-linking.ts --site=medcover.io
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/bench-internal-linking.ts --site=medcover.io --all
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/bench-internal-linking.ts --page-id=37
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/bench-internal-linking.ts --site=medcover.io --heuristic-only
 */
import { PageStatus, PrismaClient } from '@prisma/client';
import { injectInternalLinks } from '../src/modules/traffic-engine/publishing/html-internal-linking/html-link-injector';
import { buildSeoReport } from '../src/modules/traffic-engine/publishing/html-internal-linking/internal-linking-seo.report';
import { ArticleKeywordExtractorService } from '../src/modules/traffic-engine/publishing/html-internal-linking/article-keyword-extractor.service';
import { LinkTargetRepository } from '../src/modules/traffic-engine/publishing/html-internal-linking/link-target.repository';
import { OpenModelClient } from '../src/modules/clinic-inventory/clinics/enrichment/llm/openmodel.client';
import type { LlmClient } from '../src/modules/clinic-inventory/clinics/enrichment/llm/llm-client.interface';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanMarkdownOutput } from '../src/modules/traffic-engine/utils/markdown-cleaner';
import { MarkdownHtmlService } from '../src/modules/traffic-engine/content-api/markdown-html.service';

const MAX_LINKS = 4;

function ms(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(prefix))?.split('=').slice(1).join('=');
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

interface PageRow {
  id: number;
  slug: string;
  status: PageStatus;
  siteId: number;
  finalContent: string | null;
  htmlContent: string | null;
}

interface BenchResult {
  pageId: number;
  slug: string;
  htmlChars: number;
  keywords: string[];
  targets: number;
  links: number;
  reportPassed: boolean;
  reportScore: number;
  issues: string[];
  timings: {
    loadMs: number;
    renderMs: number;
    extractMs: number;
    targetsMs: number;
    injectMs: number;
    reportMs: number;
    totalMs: number;
  };
}

function renderHtml(page: PageRow, markdownHtml: MarkdownHtmlService): { html: string; renderMs: number } {
  const tRender = performance.now();
  let html = page.htmlContent?.trim() ?? '';
  if (!html && page.finalContent?.trim()) {
    const raw = page.finalContent.trim();
    html = raw.startsWith('<') ? raw : markdownHtml.toHtml(cleanMarkdownOutput(raw));
  }
  return { html, renderMs: html ? ms(tRender) : 0 };
}

async function benchPage(
  page: PageRow,
  domain: string,
  prisma: PrismaClient,
  prismaService: PrismaService,
  extractor: ArticleKeywordExtractorService,
  repo: LinkTargetRepository,
  markdownHtml: MarkdownHtmlService,
): Promise<BenchResult | null> {
  const totalStart = performance.now();
  const loadMs = 0;

  const { html, renderMs } = renderHtml(page, markdownHtml);
  if (!html.trim()) {
    return null;
  }

  const tExtract = performance.now();
  const keywords = await extractor.extract(html);
  const extractMs = ms(tExtract);

  const tTargets = performance.now();
  const targets = await repo.findPublishedTargets(
    page.siteId,
    page.id,
    keywords,
    domain,
    MAX_LINKS,
  );
  const targetsMs = ms(tTargets);

  const tInject = performance.now();
  const { html: linkedHtml, injectedLinks } = injectInternalLinks({
    html,
    targets,
    maxLinks: MAX_LINKS,
  });
  const injectMs = ms(tInject);

  const tReport = performance.now();
  const report = buildSeoReport(linkedHtml, injectedLinks, targets);
  const reportMs = ms(tReport);

  return {
    pageId: page.id,
    slug: page.slug,
    htmlChars: html.length,
    keywords: keywords.map((k) => k.phrase),
    targets: targets.length,
    links: injectedLinks.length,
    reportPassed: report.passed,
    reportScore: report.score,
    issues: report.issues,
    timings: {
      loadMs,
      renderMs,
      extractMs,
      targetsMs,
      injectMs,
      reportMs,
      totalMs: ms(totalStart),
    },
  };
}

async function resolvePages(prisma: PrismaClient): Promise<{ domain: string; pages: PageRow[] }> {
  const pageIdArg = argValue('--page-id=');
  if (pageIdArg) {
    const pageId = parseInt(pageIdArg, 10);
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        slug: true,
        status: true,
        siteId: true,
        finalContent: true,
        htmlContent: true,
      },
    });
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }
    const site = await prisma.site.findUnique({
      where: { id: page.siteId },
      select: { domain: true },
    });
    return { domain: site?.domain ?? 'example.com', pages: [page] };
  }

  const siteDomain = argValue('--site=') ?? 'medcover.io';
  const site = await prisma.site.findFirst({
    where: { domain: siteDomain },
    select: { id: true, domain: true },
  });
  if (!site) {
    throw new Error(`Site not found: ${siteDomain}`);
  }

  const pages = await prisma.page.findMany({
    where: hasFlag('--all')
      ? { siteId: site.id, status: PageStatus.PUBLISHED }
      : { siteId: site.id },
    select: {
      id: true,
      slug: true,
      status: true,
      siteId: true,
      finalContent: true,
      htmlContent: true,
    },
  });

  if (hasFlag('--all')) {
    return { domain: site.domain, pages };
  }

  const best = pages
    .map((page) => ({
      page,
      len: Math.max((page.finalContent ?? '').length, (page.htmlContent ?? '').length),
    }))
    .sort((a, b) => b.len - a.len)[0]?.page;

  if (!best) {
    throw new Error(`No pages found for site ${siteDomain}`);
  }

  return { domain: site.domain, pages: [best] };
}

function printResult(result: BenchResult, domain: string) {
  console.log('\n=== HTML Internal Linking — perf ===\n');
  console.log(`  page         : ${result.pageId} (${result.slug})`);
  console.log(`  site         : ${domain}`);
  console.log(`  html chars   : ${result.htmlChars.toLocaleString()}`);
  console.log(`  keywords     : ${result.keywords.join(', ') || '(none)'}`);
  console.log(`  targets      : ${result.targets}`);
  console.log(`  links        : ${result.links} proposed`);
  console.log(`  seo score    : ${result.reportScore}/100 (${result.reportPassed ? 'PASS' : 'FAIL'})`);
  if (result.issues.length > 0) {
    console.log(`  issues       : ${result.issues.join('; ')}`);
  }

  const t = result.timings;
  console.log('\n  Timings (ms):');
  if (t.renderMs > 0) console.log(`    render html    ${t.renderMs}`);
  console.log(`    extract (LLM)  ${t.extractMs}`);
  console.log(`    db targets     ${t.targetsMs}`);
  console.log(`    inject         ${t.injectMs}`);
  console.log(`    seo report     ${t.reportMs}`);
  console.log(`    ─────────────────`);
  console.log(`    total          ${t.totalMs}`);
  console.log();
}

async function main() {
  const heuristicOnly = hasFlag('--heuristic-only');
  if (heuristicOnly) {
    delete process.env.OPENMODEL_API_KEY;
  }

  const llm: LlmClient = heuristicOnly
    ? {
        completeJson: async () => {
          throw new Error('heuristic-only bench mode');
        },
      }
    : new OpenModelClient();

  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const extractor = new ArticleKeywordExtractorService(llm);
  const repo = new LinkTargetRepository(prismaService);
  const markdownHtml = new MarkdownHtmlService();

  try {
    const { domain, pages } = await resolvePages(prisma);
    const results: BenchResult[] = [];

    console.log(`\n=== medcover.io internal linking bench ===`);
    console.log(`  site     : ${domain}`);
    console.log(`  pages    : ${pages.length}`);
    console.log(`  mode     : ${heuristicOnly ? 'heuristic-only' : 'LLM + fallback'}`);
    console.log();

    for (const page of pages) {
      const result = await benchPage(
        page,
        domain,
        prisma,
        prismaService,
        extractor,
        repo,
        markdownHtml,
      );
      if (!result) {
        console.log(`  skip page ${page.id} ${page.slug} — no HTML content`);
        continue;
      }
      results.push(result);

      if (pages.length === 1) {
        printResult(result, domain);
      } else {
        console.log(
          `  page ${result.pageId} ${result.slug} | ${result.htmlChars} chars | ` +
            `kw=${result.keywords.length} targets=${result.targets} links=${result.links} | ` +
            `${result.timings.totalMs}ms (${result.reportPassed ? 'PASS' : 'FAIL'})`,
        );
      }
    }

    if (results.length > 1) {
      const avgTotal = Math.round(
        results.reduce((acc, r) => acc + r.timings.totalMs, 0) / results.length,
      );
      const avgExtract = Math.round(
        results.reduce((acc, r) => acc + r.timings.extractMs, 0) / results.length,
      );
      const withLinks = results.filter((r) => r.links > 0).length;

      console.log('\n=== Aggregate ===');
      console.log(`  processed      : ${results.length}`);
      console.log(`  with links     : ${withLinks}`);
      console.log(`  avg extract ms : ${avgExtract}`);
      console.log(`  avg total ms   : ${avgTotal}`);
      console.log();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
