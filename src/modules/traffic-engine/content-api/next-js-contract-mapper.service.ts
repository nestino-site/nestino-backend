import { Injectable } from '@nestjs/common';
import { Page, PipelineStatus, Site } from '@prisma/client';
import { HreflangService } from '../seo-strategy/hreflang.service';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';

type PageWithDetails = Page & {
  site: Site;
  aiGenerationLogs: Array<{
    model: string;
    cost: unknown;
    stepKey: string;
    createdAt: Date;
  }>;
};

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
  constructor(private readonly hreflang: HreflangService) {}

  async toContract(page: PageWithDetails) {
    const [hreflangAlternates] = await Promise.all([
      this.hreflang.getAlternatesForPage(page.id),
    ]);
    const latestLog = page.aiGenerationLogs[0];
    const status = this.mapStatus(page.pipelineStatus);
    const totalCost = page.aiGenerationLogs.reduce((sum, log) => sum + Number(log.cost), 0);

    const finalContent = page.finalContent != null ? cleanMarkdownOutput(page.finalContent) : null;
    const base = this.normalizeDomain(page.site.domain);
    const canonical = this.buildUrl(base, page.slug);
    const heroImage = this.extractHeroImage(page);
    const tableOfContents = finalContent ? this.buildToc(finalContent) : [];
    const faq = finalContent ? this.extractFaq(finalContent) : [];
    const breadcrumbs = this.buildBreadcrumbs(page, page.site);

    return {
      version: '2.1',
      status,

      // Core content
      draft: page.rawDraft != null ? cleanMarkdownOutput(page.rawDraft) : null,
      finalContent,
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
      tableOfContents,
      breadcrumbs,
      faq,

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

  private extractHeroImage(page: PageWithDetails): HeroImage {
    const cdnBase = process.env.CDN_BASE_URL?.trim();

    if (cdnBase && page.slug) {
      // If images are uploaded to CDN keyed by page slug, prefer that URL
      const cdnUrl = `${cdnBase.replace(/\/$/, '')}/pages/${page.id}/hero.webp`;
      return {
        url: cdnUrl,
        alt: page.title ?? page.metaTitle ?? null,
        width: 1200,
        height: 630,
      };
    }

    // Return data URI only if CDN not configured (won't appear in JSON-LD; just for preview)
    if (page.generatedImageBase64) {
      return {
        url: `data:image/webp;base64,${page.generatedImageBase64.slice(0, 20)}...`,
        alt: page.title ?? null,
        width: null,
        height: null,
      };
    }

    return { url: null, alt: null, width: null, height: null };
  }

  private buildToc(content: string): TocItem[] {
    const lines = content.split('\n');
    const items: TocItem[] = [];
    let position = 0;
    for (const line of lines) {
      const h2 = line.match(/^##\s+(.+)$/);
      const h3 = line.match(/^###\s+(.+)$/);
      if (h2) {
        items.push({
          level: 2,
          text: h2[1].trim(),
          anchor: this.slugifyHeading(h2[1]),
        });
        position++;
      } else if (h3) {
        items.push({
          level: 3,
          text: h3[1].trim(),
          anchor: this.slugifyHeading(h3[1]),
        });
        position++;
      }
      if (position >= 20) break;
    }
    return items;
  }

  private extractFaq(content: string): FaqItem[] {
    const faqItems: FaqItem[] = [];
    const faqSectionMatch = content.match(/##\s+(?:FAQ|Frequently Asked Questions)[^\n]*([\s\S]*?)(?=\n##|\s*$)/i);
    if (!faqSectionMatch) return faqItems;

    const section = faqSectionMatch[1];
    const qBlocks = section.split(/\n###\s+/).filter(Boolean);
    for (const block of qBlocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;
      const question = lines[0].replace(/^\?+/, '').trim();
      const answer = lines.slice(1).join('\n').trim();
      if (question && answer) {
        faqItems.push({ question, answer });
      }
      if (faqItems.length >= 8) break;
    }
    return faqItems;
  }

  private buildBreadcrumbs(page: PageWithDetails, site: Site): BreadcrumbItem[] {
    const base = this.normalizeDomain(site.domain);
    const crumbs: BreadcrumbItem[] = [
      { name: 'Home', slug: base, position: 1 },
    ];

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

  private slugifyHeading(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);
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

  private mapStatus(status: PipelineStatus): string {
    if (status === PipelineStatus.READY) return 'ready';
    if (status === PipelineStatus.FAILED) return 'failed';
    if (status === PipelineStatus.PARTIALLY_COMPLETED) return 'partially_completed';
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
