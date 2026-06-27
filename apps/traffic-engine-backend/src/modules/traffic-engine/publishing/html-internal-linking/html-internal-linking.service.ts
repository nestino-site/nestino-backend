/**
 * HtmlInternalLinkingService — orchestrator for HTML-level internal linking.
 *
 * Entry points:
 *  - injectLinks(options)  Used at publish time; only writes if SEO report passes.
 *  - preview(pageId)       Dry-run for QA: full pipeline, no DB write, returns report.
 *
 * Both methods degrade gracefully: any unhandled exception returns the original
 * HTML so publishing is never blocked.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ContentCacheService } from '../../content-api/content-cache.service';
import { ContentRenderService } from '../../content-api/content-render.service';
import { ArticleKeywordExtractorService } from './article-keyword-extractor.service';
import { injectInternalLinks } from './html-link-injector';
import { LinkTargetRepository } from './link-target.repository';
import { buildSeoReport } from './internal-linking-seo.report';
import type {
  InjectLinksOptions,
  InjectLinksResult,
  PreviewResult,
} from './html-internal-linking.types';

const DEFAULT_MAX_LINKS = 4;
const HTML_PREVIEW_CHARS = 2000;

@Injectable()
export class HtmlInternalLinkingService {
  private readonly logger = new Logger(HtmlInternalLinkingService.name);

  constructor(
    private readonly extractor: ArticleKeywordExtractorService,
    private readonly repo: LinkTargetRepository,
    private readonly prisma: PrismaService,
    private readonly contentRender: ContentRenderService,
    private readonly contentCache: ContentCacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public: inject at publish time
  // ---------------------------------------------------------------------------

  /**
   * Runs the full internal-linking pipeline on an already-rendered HTML string.
   * Returns the modified HTML only if the SEO quality report passes.
   * Falls back to the original HTML on any error.
   */
  async injectLinks(options: InjectLinksOptions): Promise<InjectLinksResult> {
    const { html, siteId, currentPageId, domain, maxLinks = DEFAULT_MAX_LINKS } = options;

    const emptyReport = buildSeoReport('', [], []);

    if (!html?.trim()) {
      return { html, linksInjected: 0, injectedLinks: [], report: emptyReport };
    }

    try {
      const keywords = await this.extractor.extract(html);

      if (keywords.length === 0) {
        this.logger.warn({
          msg: 'html_internal_linking_no_keywords',
          pageId: currentPageId,
        });
        return { html, linksInjected: 0, injectedLinks: [], report: emptyReport };
      }

      const targets = await this.repo.findPublishedTargets(
        siteId,
        currentPageId,
        keywords,
        domain,
        maxLinks,
      );

      if (targets.length === 0) {
        this.logger.warn({
          msg: 'html_internal_linking_no_targets',
          pageId: currentPageId,
          keywords: keywords.map((k) => k.phrase),
        });
        return { html, linksInjected: 0, injectedLinks: [], report: emptyReport };
      }

      const { html: linkedHtml, injectedLinks } = injectInternalLinks({
        html,
        targets,
        maxLinks,
      });

      const report = buildSeoReport(linkedHtml, injectedLinks, targets);

      this.logger.log({
        msg: 'html_internal_linking_complete',
        pageId: currentPageId,
        siteId,
        linksInjected: injectedLinks.length,
        reportPassed: report.passed,
        reportScore: report.score,
        issues: report.issues,
      });

      if (!report.passed) {
        this.logger.warn({
          msg: 'html_internal_linking_report_failed_rollback',
          pageId: currentPageId,
          issues: report.issues,
          score: report.score,
        });
        // Return original HTML — never commit bad links
        return { html, linksInjected: 0, injectedLinks: [], report };
      }

      return {
        html: linkedHtml,
        linksInjected: injectedLinks.length,
        injectedLinks,
        report,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({
        msg: 'html_internal_linking_error',
        pageId: currentPageId,
        error: msg,
      });
      return { html, linksInjected: 0, injectedLinks: [], report: emptyReport };
    }
  }

  // ---------------------------------------------------------------------------
  // Public: preview / dry-run
  // ---------------------------------------------------------------------------

  /**
   * Dry-run pipeline for a page identified by ID.
   * Loads the page, renders its markdown to HTML (same as publish would do),
   * runs the full linking pipeline, and returns the QA result — without writing
   * anything to the database.
   */
  async preview(pageId: number): Promise<PreviewResult> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });

    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const rendered = this.contentRender.renderFromMarkdown(page.finalContent);
    const html = rendered.htmlContent ?? '';

    if (!html.trim()) {
      return {
        pageId,
        extractedKeywords: [],
        candidateTargets: [],
        proposedLinks: [],
        htmlBefore: '',
        htmlAfter: '',
        report: buildSeoReport('', [], []),
      };
    }

    const keywords = await this.extractor.extract(html);
    const maxLinks = DEFAULT_MAX_LINKS;

    const targets = await this.repo.findPublishedTargets(
      page.siteId,
      pageId,
      keywords,
      page.site.domain,
      maxLinks,
    );

    const { html: linkedHtml, injectedLinks } = injectInternalLinks({
      html,
      targets,
      maxLinks,
    });

    const report = buildSeoReport(linkedHtml, injectedLinks, targets);

    return {
      pageId,
      extractedKeywords: keywords,
      candidateTargets: targets,
      proposedLinks: injectedLinks,
      htmlBefore: html.slice(0, HTML_PREVIEW_CHARS),
      htmlAfter: linkedHtml.slice(0, HTML_PREVIEW_CHARS),
      report,
    };
  }

  // ---------------------------------------------------------------------------
  // Public: apply (write linked HTML to DB)
  // ---------------------------------------------------------------------------

  /**
   * Runs injectLinks and persists htmlContent when the SEO report passes and
   * at least one link was injected. Invalidates the content cache afterward.
   */
  async apply(pageId: number): Promise<InjectLinksResult & { applied: boolean; slug: string }> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });

    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const rendered = this.contentRender.renderFromMarkdown(page.finalContent);
    const html = rendered.htmlContent ?? '';

    if (!html.trim()) {
      const emptyReport = buildSeoReport('', [], []);
      return {
        html,
        linksInjected: 0,
        injectedLinks: [],
        report: emptyReport,
        applied: false,
        slug: page.slug,
      };
    }

    const result = await this.injectLinks({
      html,
      siteId: page.siteId,
      currentPageId: pageId,
      domain: page.site.domain,
      maxLinks: DEFAULT_MAX_LINKS,
    });

    let applied = false;
    if (result.report.passed && result.linksInjected > 0) {
      const hasLinkInHtml = result.injectedLinks.some((link) => result.html.includes(link.url));
      if (!hasLinkInHtml) {
        this.logger.warn({
          msg: 'html_internal_linking_apply_skipped_corrupt_html',
          pageId,
          linksInjected: result.linksInjected,
        });
      } else {
        await this.prisma.page.update({
          where: { id: pageId },
          data: { htmlContent: result.html },
        });
        await this.contentCache.invalidatePage(page.siteId, page.slug, pageId);
        applied = true;
        this.logger.log({
          msg: 'html_internal_linking_applied',
          pageId,
          linksInjected: result.linksInjected,
          reportScore: result.report.score,
        });
      }
    }

    return { ...result, applied, slug: page.slug };
  }
}
