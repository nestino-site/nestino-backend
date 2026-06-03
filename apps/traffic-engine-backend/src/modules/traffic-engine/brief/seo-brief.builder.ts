import { Injectable } from '@nestjs/common';
import { ContentTemplate, Keyword, KeywordIntent, Page, PageStatus, Site } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { KeywordDataProviderService } from '../keyword-research/keyword-data-provider.service';
import { SemanticExpansionService } from '../intelligence/keyword-intelligence/semantic-expansion.service';

export interface InternalLinkBriefTarget {
  pageId: number;
  slug: string;
  title: string | null;
  keyword: string;
}

export interface TemplateFormatting {
  headingStructure?: unknown;
  seoRules?: string[];
  faqStructure?: unknown;
  formattingInstructions?: string;
  internalLinkingRules?: string;
}

export interface SeoBrief {
  siteName: string;
  domain: string;
  language: string;
  keyword: string;
  searchIntent: KeywordIntent;
  targetWordCount: number;
  requiredSections: string[];
  paaQuestions: string[];
  semanticTopics: string[];
  competitorOutlineHints: string[];
  internalLinkTargets: InternalLinkBriefTarget[];
  knowledgeFacts?: Record<string, unknown>;
  serpEntities: string[];
  hasAiOverview: boolean;
  hasFaqFeature: boolean;
  templateFormatting?: TemplateFormatting;
}

@Injectable()
export class SeoBriefBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semanticExpansion: SemanticExpansionService,
    private readonly serpDataProvider: KeywordDataProviderService,
  ) {}

  async build(
    site: Site,
    keyword: Keyword,
    page: Page,
    options?: {
      clusterSecondaryKeywords?: string[];
      template?: ContentTemplate | null;
      pillarPageId?: number | null;
    },
  ): Promise<SeoBrief> {
    const intent = keyword.intent;

    // Fetch SERP snapshot and semantic expansion in parallel
    const [semanticTopics, serpSnap] = await Promise.all([
      this.semanticExpansion.expand(keyword.keyword, intent, keyword.language),
      this.serpDataProvider
        .getSnapshot(keyword.keyword, keyword.language)
        .catch(() => null),
    ]);

    const requiredSections = this.extractRequiredSections(options?.template);

    // Use real PAA from SERP if available, else fall back to heuristic questions
    let paaQuestions: string[] = serpSnap?.paaQuestions?.length
      ? serpSnap.paaQuestions.slice(0, 8)
      : semanticTopics
          .filter((t) => t.includes('?') || t.toLowerCase().startsWith('how ') || t.toLowerCase().startsWith('what '))
          .slice(0, 8);
    if (!paaQuestions.length) {
      paaQuestions = semanticTopics.slice(0, 6);
    }

    // Competitor heading hints: SERP organic titles first, then DB ideas
    const serpCompetitorHints: string[] = (serpSnap?.organicTitles ?? []).slice(0, 6);
    const dbCompetitorHints = await this.loadSubjectOutlineHints(site.id, keyword.keyword);
    const competitorOutlineHints = [...new Set([...serpCompetitorHints, ...dbCompetitorHints])].slice(0, 12);

    const internalLinkTargets = await this.loadInternalLinkTargets(
      site.id,
      page.id,
      keyword.keyword,
      options?.clusterSecondaryKeywords ?? [],
      options?.pillarPageId,
    );

    const knowledgeFacts = this.extractKnowledgeFacts(site.config);
    const serpEntities: string[] = serpSnap?.entities ?? [];
    const templateFormatting = this.extractTemplateFormatting(options?.template);

    return {
      siteName: site.name,
      domain: site.domain,
      language: keyword.language,
      keyword: keyword.keyword,
      searchIntent: intent,
      targetWordCount: this.targetWordCountForIntent(intent),
      requiredSections,
      paaQuestions,
      semanticTopics,
      competitorOutlineHints,
      internalLinkTargets,
      knowledgeFacts,
      serpEntities,
      hasAiOverview: serpSnap?.hasAiOverview ?? false,
      hasFaqFeature: serpSnap?.hasFaqFeature ?? false,
      templateFormatting,
    };
  }

  private extractTemplateFormatting(template?: ContentTemplate | null): TemplateFormatting | undefined {
    if (!template) return undefined;
    const seoRulesRaw = template.seoRules;
    const seoRules = Array.isArray(seoRulesRaw)
      ? (seoRulesRaw as unknown[]).map((r) => String(r)).filter(Boolean)
      : typeof seoRulesRaw === 'string'
        ? [seoRulesRaw]
        : [];
    const formattingInstructions =
      typeof template.formattingInstructions === 'string'
        ? template.formattingInstructions.trim()
        : undefined;
    const internalLinkingRules =
      typeof template.internalLinkingRules === 'string'
        ? template.internalLinkingRules.trim()
        : template.internalLinkingRules && typeof template.internalLinkingRules === 'object'
          ? JSON.stringify(template.internalLinkingRules).slice(0, 300)
          : undefined;

    return {
      headingStructure: template.headingStructure ?? undefined,
      seoRules: seoRules.length > 0 ? seoRules : undefined,
      faqStructure: template.faqStructure ?? undefined,
      formattingInstructions: formattingInstructions || undefined,
      internalLinkingRules: internalLinkingRules || undefined,
    };
  }

  private targetWordCountForIntent(intent: KeywordIntent): number {
    switch (intent) {
      case KeywordIntent.TRANSACTIONAL:
        return 1200;
      case KeywordIntent.COMMERCIAL:
        return 1500;
      case KeywordIntent.NAVIGATIONAL:
        return 800;
      case KeywordIntent.INFORMATIONAL:
      default:
        return 1800;
    }
  }

  private extractRequiredSections(template?: ContentTemplate | null): string[] {
    if (!template?.requiredSections) {
      return ['Introduction', 'Main content', 'FAQ', 'Conclusion'];
    }
    const raw = template.requiredSections;
    if (Array.isArray(raw)) {
      return raw.map((s) => String(s)).filter(Boolean);
    }
    if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { sections?: unknown }).sections)) {
      return ((raw as { sections: unknown[] }).sections).map((s) => String(s)).filter(Boolean);
    }
    return ['Introduction', 'Main content', 'FAQ'];
  }

  private async loadSubjectOutlineHints(siteId: number, keyword: string): Promise<string[]> {
    const ideas = await this.prisma.contentIdea.findMany({
      where: {
        subject: { siteId },
        OR: [
          { targetKeyword: { contains: keyword, mode: 'insensitive' } },
          { title: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      select: { title: true, outline: true, headings: true },
      take: 5,
      orderBy: { confidenceScore: 'desc' },
    });

    const hints: string[] = [];
    for (const idea of ideas) {
      if (idea.headings?.length) {
        hints.push(...idea.headings.slice(0, 6));
      } else if (idea.outline && typeof idea.outline === 'object') {
        const h2s = (idea.outline as { h2s?: string[] }).h2s;
        if (Array.isArray(h2s)) {
          hints.push(...h2s.slice(0, 6));
        }
      } else {
        hints.push(idea.title);
      }
    }
    return [...new Set(hints)].slice(0, 12);
  }

  private async loadInternalLinkTargets(
    siteId: number,
    excludePageId: number,
    primaryKeyword: string,
    secondaryKeywords: string[],
    pillarPageId?: number | null,
  ): Promise<InternalLinkBriefTarget[]> {
    const pages = await this.prisma.page.findMany({
      where: {
        siteId,
        id: { not: excludePageId },
        status: PageStatus.PUBLISHED,
      },
      include: { keyword: true },
      take: 30,
      orderBy: { publishedAt: 'desc' },
    });

    const terms = [primaryKeyword, ...secondaryKeywords].map((t) => t.toLowerCase());

    return pages
      .map((p) => {
        const kw = p.keyword.keyword.toLowerCase();
        let score = 0;
        if (terms.some((t) => kw.includes(t) || t.includes(kw))) {
          score += 2;
        }
        if (pillarPageId && p.id === pillarPageId) {
          score += 5;
        }
        return { page: p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ page: p }) => ({
        pageId: p.id,
        slug: p.slug,
        title: p.title,
        keyword: p.keyword.keyword,
      }));
  }

  private extractKnowledgeFacts(config: unknown): Record<string, unknown> | undefined {
    if (config == null || typeof config !== 'object' || Array.isArray(config)) {
      return undefined;
    }
    const c = config as Record<string, unknown>;
    const kb = c.knowledgeBase ?? c.knowledge_base;
    if (kb && typeof kb === 'object' && !Array.isArray(kb)) {
      return kb as Record<string, unknown>;
    }
    return undefined;
  }
}
