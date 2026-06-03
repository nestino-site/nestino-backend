import { Injectable } from '@nestjs/common';
import { PipelineStatus } from '@prisma/client';
import { HreflangService } from '../seo-strategy/hreflang.service';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';
import { ContentPageRecord } from './content-page.select';
import { ContentRenderService } from './content-render.service';

export interface BreadcrumbItem {
  name: string;
  slug: string;
  position: number;
}

export interface TocItem {
  level: number;
  text: string;
  anchor: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface HeroImage {
  url: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
}

@Injectable()
export class NextJsContractMapperService {
  constructor(
    private readonly hreflang: HreflangService,
    private readonly contentRender: ContentRenderService,
  ) {}

  async toContract(page: ContentPageRecord) {
    const hreflangAlternates = await this.hreflang.getAlternatesForPageData(page, page.site);
    const latestLog = page.aiGenerationLogs[0];
    const status = this.mapStatus(page.pipelineStatus, Boolean(page.finalContent?.trim()));
    const totalCost = page.aiGenerationLogs.reduce((sum, log) => sum + Number(log.cost), 0);

    const finalContent = page.finalContent != null ? cleanMarkdownOutput(page.finalContent) : null;
    const rendered =
      page.htmlContent != null
        ? {
            htmlContent: page.htmlContent,
            tableOfContents: this.parseToc(page.tableOfContents),
            faq: this.parseFaq(page.faq),
          }
        : this.contentRender.renderFromMarkdown(finalContent);

    const base = this.normalizeDomain(page.site.domain);
    const canonical = this.buildUrl(base, page.slug);
    const heroImage = this.extractHeroImage(page);
    const breadcrumbs = this.buildBreadcrumbs(page, page.site);

    return {
      version: '2.2',
      status,

      // Core content
      pageId: page.id,
      hasHeroImage: Boolean(page.generatedImageCdnUrl || page.generatedImageBase64),
      finalContent,
      htmlContent: rendered.htmlContent,
      wordCount: page.wordCount,
      language: page.language,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      updatedAt: page.updatedAt.toISOString(),

      // SEO head fields (consumed directly by <Head> in Next.js)
      seo: {
        title: page.title ?? null,
        metaTitle: page.metaTitle ?? null,
        metaDescription: page.metaDescription ?? null,
        canonical,
        robotsMeta: page.status === 'PUBLISHED' ? 'index, follow' : 'noindex, nofollow',
        language: page.language.toLowerCase(),
        og: {
          title: page.metaTitle ?? page.title ?? null,
          description: page.metaDescription ?? null,
          image: heroImage.url,
          type: 'article',
          url: canonical,
        },
        twitter: {
          card: heroImage.url ? 'summary_large_image' : 'summary',
          title: page.metaTitle ?? page.title ?? null,
          description: page.metaDescription ?? null,
          image: heroImage.url,
        },
        hreflangAlternates,
      },

      // Structural content
      tableOfContents: rendered.tableOfContents,
      breadcrumbs,
      faq: rendered.faq,

      // Image
      heroImage,
      imagePrompt: page.imagePrompt ?? null,

      // Analysis scores
      analysis: {
        seoScore: page.seoScore,
        seoCheckScore: page.seoCheckScore,
        seoCheckPassed: page.seoCheckPassed,
        seoCheckIssues: page.seoCheckIssues ?? null,
        readabilityScore: page.readabilityScore,
        intentMatch: page.intentMatch,
        contentDepth: page.contentDepth,
        redundancyScore: page.redundancyScore,
        geoScore: page.geoScore,
        gaps: page.contentGaps,
      },

      // Schema (consumed as JSON-LD by Next.js page)
      schemaMarkup: page.schemaMarkup ?? null,

      // Pipeline metadata
      meta: {
        pipelineStatus: page.pipelineStatus,
        pipelineVersion: page.pipelineVersion ?? 3,
        cost: Number(totalCost.toFixed(6)),
        modelUsed: latestLog?.model ?? null,
        completedSteps: this.deriveCompletedSteps(page.pipelineStatus),
        skippedSteps: page.pipelineStatus === PipelineStatus.SKIPPED_STEP ? ['rewrite'] : [],
      },
    };
  }

  private parseToc(value: unknown): TocItem[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is TocItem =>
        typeof item === 'object' &&
        item != null &&
        typeof (item as TocItem).level === 'number' &&
        typeof (item as TocItem).text === 'string' &&
        typeof (item as TocItem).anchor === 'string',
    );
  }

  private parseFaq(value: unknown): FaqItem[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is FaqItem =>
        typeof item === 'object' &&
        item != null &&
        typeof (item as FaqItem).question === 'string' &&
        typeof (item as FaqItem).answer === 'string',
    );
  }

  private extractHeroImage(page: ContentPageRecord): HeroImage {
    if (page.generatedImageCdnUrl) {
      return {
        url: page.generatedImageCdnUrl,
        alt: page.title ?? page.metaTitle ?? null,
        width: 1200,
        height: 630,
      };
    }

    return { url: null, alt: null, width: null, height: null };
  }

  private buildBreadcrumbs(
    page: ContentPageRecord,
    site: ContentPageRecord['site'],
  ): BreadcrumbItem[] {
    const base = this.normalizeDomain(site.domain);
    const crumbs: BreadcrumbItem[] = [{ name: 'Home', slug: base, position: 1 }];

    const slugParts = page.slug.replace(/^\//, '').split('/');
    let accumulated = '';
    for (let i = 0; i < slugParts.length; i++) {
      accumulated += `/${slugParts[i]}`;
      const isLast = i === slugParts.length - 1;
      crumbs.push({
        name: isLast && page.title ? page.title : this.prettySlugPart(slugParts[i]),
        slug: `${base}${accumulated}`,
        position: i + 2,
      });
    }
    return crumbs;
  }

  private prettySlugPart(part: string): string {
    return part.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private normalizeDomain(domain: string): string {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      return domain.endsWith('/') ? domain.slice(0, -1) : domain;
    }
    return `https://${domain.replace(/\/$/, '')}`;
  }

  private buildUrl(base: string, slug: string): string {
    const path = slug.startsWith('/') ? slug : `/${slug}`;
    return `${base}${path}`;
  }

  private mapStatus(status: PipelineStatus, hasFinalContent: boolean): string {
    if (status === PipelineStatus.READY) {
      return 'ready';
    }
    if (
      hasFinalContent &&
      (status === PipelineStatus.PARTIALLY_COMPLETED || status === PipelineStatus.FAILED)
    ) {
      return 'ready';
    }
    if (status === PipelineStatus.FAILED) {
      return 'failed';
    }
    if (status === PipelineStatus.PARTIALLY_COMPLETED) {
      return 'partially_completed';
    }
    return status.toLowerCase();
  }

  private deriveCompletedSteps(status: PipelineStatus): string[] {
    if (status === PipelineStatus.PENDING) return [];
    if (status === PipelineStatus.GENERATING) return ['generate'];
    if (status === PipelineStatus.VALIDATING) return ['generate', 'validate'];
    if (status === PipelineStatus.ANALYZING) return ['generate', 'validate', 'analyze'];
    return ['generate', 'validate', 'analyze', 'rewrite'];
  }
}
