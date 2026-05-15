import { Injectable } from '@nestjs/common';
import { ContentTemplate, Keyword, KeywordIntent, Page, PageStatus, Site } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SemanticExpansionService } from '../intelligence/keyword-intelligence/semantic-expansion.service';

export interface InternalLinkBriefTarget {
  pageId: number;
  slug: string;
  title: string | null;
  keyword: string;
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
}

@Injectable()
export class SeoBriefBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semanticExpansion: SemanticExpansionService,
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
    const semanticTopics = await this.semanticExpansion.expand(
      keyword.keyword,
      intent,
      keyword.language,
    );

    const requiredSections = this.extractRequiredSections(options?.template);
    const paaQuestions = semanticTopics
      .filter((t) => t.includes('?') || t.toLowerCase().startsWith('how ') || t.toLowerCase().startsWith('what '))
      .slice(0, 8);

    const competitorOutlineHints = await this.loadSubjectOutlineHints(site.id, keyword.keyword);
    const internalLinkTargets = await this.loadInternalLinkTargets(
      site.id,
      page.id,
      keyword.keyword,
      options?.clusterSecondaryKeywords ?? [],
      options?.pillarPageId,
    );

    const knowledgeFacts = this.extractKnowledgeFacts(site.config);

    return {
      siteName: site.name,
      domain: site.domain,
      language: keyword.language,
      keyword: keyword.keyword,
      searchIntent: intent,
      targetWordCount: this.targetWordCountForIntent(intent),
      requiredSections,
      paaQuestions: paaQuestions.length > 0 ? paaQuestions : semanticTopics.slice(0, 6),
      semanticTopics,
      competitorOutlineHints,
      internalLinkTargets,
      knowledgeFacts,
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
