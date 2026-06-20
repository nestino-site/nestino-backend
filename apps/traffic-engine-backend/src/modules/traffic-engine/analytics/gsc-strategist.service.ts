import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AiProvider,
  ContentLanguage,
  ContentType,
  IdeaStatus,
  KeywordIntent,
  Prisma,
  SubjectStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiPipelineStepConfig } from '../ai/types/ai-pipeline.types';
import { buildGscStrategistPrompt } from './gsc-strategist.prompt';
import { GscStrategistInputBuilder } from './gsc-strategist-input.builder';

const GSC_SUBJECT_TITLE = 'GSC Opportunities';
const DEFAULT_GEMINI_MODEL = process.env.AI_IDEA_GENERATION_MODEL ?? 'gemini-3.1-flash-lite';

export interface GscStrategistOpportunity {
  priority_score: number;
  content_type: string;
  main_topic: string;
  target_queries: string[];
  search_intent: string;
  why_this_matters: string;
  suggested_title: string;
  content_outline: string[];
  quick_win: boolean;
}

export interface GscStrategistPreviewResult {
  siteId: number;
  candidateCount: number;
  opportunityCount: number;
  opportunities: GscStrategistOpportunity[];
}

export interface GscStrategistRunResult extends GscStrategistPreviewResult {
  contentIdeasCreated: number;
  createdIdeaIds: number[];
  skipped: number;
}

@Injectable()
export class GscStrategistService {
  private readonly logger = new Logger(GscStrategistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputBuilder: GscStrategistInputBuilder,
    private readonly orchestrator: AiOrchestratorService,
  ) {}

  async preview(siteId: number): Promise<GscStrategistPreviewResult> {
    await this.ensureSite(siteId);
    const payload = await this.inputBuilder.build(siteId);
    const opportunities = await this.analyzeWithLlm(payload);
    return {
      siteId,
      candidateCount: payload.candidates.length,
      opportunityCount: opportunities.length,
      opportunities,
    };
  }

  async run(siteId: number): Promise<GscStrategistRunResult> {
    const site = await this.ensureSite(siteId);
    const payload = await this.inputBuilder.build(siteId);
    const opportunities = await this.analyzeWithLlm(payload);
    const subjectId = await this.ensureGscSubject(siteId, site.defaultLanguage);
    const maxOpportunities = Number(process.env.GSC_STRATEGIST_MAX_OPPORTUNITIES ?? 15);

    let contentIdeasCreated = 0;
    let skipped = 0;
    const createdIdeaIds: number[] = [];

    for (const opportunity of opportunities.slice(0, maxOpportunities)) {
      const persisted = await this.persistOpportunity(subjectId, siteId, opportunity, payload);
      if (persisted) {
        contentIdeasCreated += 1;
        createdIdeaIds.push(persisted);
      } else {
        skipped += 1;
      }
    }

    this.logger.log({
      msg: 'gsc_strategist_run_complete',
      siteId,
      candidateCount: payload.candidates.length,
      opportunityCount: opportunities.length,
      contentIdeasCreated,
      skipped,
    });

    return {
      siteId,
      candidateCount: payload.candidates.length,
      opportunityCount: opportunities.length,
      opportunities,
      contentIdeasCreated,
      createdIdeaIds,
      skipped,
    };
  }

  private async ensureSite(siteId: number) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, defaultLanguage: true },
    });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
    return site;
  }

  private async analyzeWithLlm(
    payload: Awaited<ReturnType<GscStrategistInputBuilder['build']>>,
  ): Promise<GscStrategistOpportunity[]> {
    if (payload.candidates.length === 0) {
      return [];
    }

    const prompt = buildGscStrategistPrompt(payload);
    const provider = AiProvider.google;
    const step: AiPipelineStepConfig = {
      stepKey: 'gsc_strategist',
      provider,
      model: this.resolveModel(provider),
      promptTemplateId: 'gsc_strategist_v1',
      maxOutputTokens: 12_000,
      timeoutMs: 240_000,
      responseFormat: 'json',
    };

    const output = await this.orchestrator.runStepWithPrompt(step, prompt);
    return this.parseOpportunitiesJson(output.text);
  }

  private parseOpportunitiesJson(text: string): GscStrategistOpportunity[] {
    const trimmed = text.trim();
    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');
    if (objectStart < 0 || objectEnd < 0) {
      throw new Error('GSC strategist response did not contain JSON');
    }

    const parsed = JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as {
      opportunities?: GscStrategistOpportunity[];
    };

    const opportunities = Array.isArray(parsed.opportunities) ? parsed.opportunities : [];
    return opportunities
      .map((item) => this.normalizeOpportunity(item))
      .filter((item): item is GscStrategistOpportunity => item != null)
      .sort((a, b) => b.priority_score - a.priority_score);
  }

  private normalizeOpportunity(raw: GscStrategistOpportunity): GscStrategistOpportunity | null {
    const title = raw.suggested_title?.trim();
    const mainTopic = raw.main_topic?.trim();
    const queries = (raw.target_queries ?? []).map((q) => q.trim()).filter(Boolean);
    if (!title || queries.length === 0) {
      return null;
    }

    return {
      priority_score: Math.min(100, Math.max(1, Number(raw.priority_score) || 50)),
      content_type: (raw.content_type ?? 'guide').toLowerCase(),
      main_topic: mainTopic || title,
      target_queries: queries,
      search_intent: raw.search_intent?.trim() || 'informational',
      why_this_matters: raw.why_this_matters?.trim() || '',
      suggested_title: title,
      content_outline: (raw.content_outline ?? []).map((line) => line.trim()).filter(Boolean),
      quick_win: Boolean(raw.quick_win),
    };
  }

  private async persistOpportunity(
    subjectId: number,
    siteId: number,
    opportunity: GscStrategistOpportunity,
    payload: Awaited<ReturnType<GscStrategistInputBuilder['build']>>,
  ): Promise<number | null> {
    const primaryKeyword = opportunity.target_queries[0];
    const slug = this.normalizeSlug(opportunity.suggested_title, primaryKeyword);

    const existingIdea = await this.prisma.contentIdea.findFirst({
      where: {
        subjectId,
        OR: [{ slug }, { targetKeyword: primaryKeyword }],
        status: { in: [IdeaStatus.PENDING_REVIEW, IdeaStatus.APPROVED] },
      },
      select: { id: true },
    });
    if (existingIdea) {
      return null;
    }

    if (this.shouldSkipExistingDedicatedPage(opportunity, payload)) {
      return null;
    }

    const reviewNotes = this.buildReviewNotes(opportunity);
    const outline = {
      mainTopic: opportunity.main_topic,
      targetQueries: opportunity.target_queries,
      contentOutline: opportunity.content_outline,
      quickWin: opportunity.quick_win,
      priorityScore: opportunity.priority_score,
      source: 'gsc_strategist',
    } satisfies Record<string, unknown>;

    try {
      const created = await this.prisma.contentIdea.create({
        data: {
          subjectId,
          title: opportunity.suggested_title,
          slug,
          targetKeyword: primaryKeyword,
          metaDescription: opportunity.why_this_matters.slice(0, 500) || undefined,
          searchIntent: this.parseIntent(opportunity.search_intent),
          outline: outline as Prisma.InputJsonValue,
          headings: opportunity.content_outline.slice(0, 8),
          internalLinkingSuggestions: [],
          contentType: this.parseContentType(opportunity.content_type),
          confidenceScore: opportunity.priority_score / 100,
          status: IdeaStatus.PENDING_REVIEW,
          reviewNotes,
          generatedBy: AiProvider.google,
          generatedModel: DEFAULT_GEMINI_MODEL,
        },
      });
      return created.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'gsc_strategist_idea_skipped', siteId, slug, error: message });
      return null;
    }
  }

  private shouldSkipExistingDedicatedPage(
    opportunity: GscStrategistOpportunity,
    payload: Awaited<ReturnType<GscStrategistInputBuilder['build']>>,
  ): boolean {
    const primary = opportunity.target_queries[0]?.toLowerCase() ?? '';
    if (!primary) return false;

    const dedicatedPage = payload.existingPages.find((page) => {
      const slug = page.slug.toLowerCase();
      const title = page.title.toLowerCase();
      return slug.includes(primary) || title.includes(primary);
    });
    if (!dedicatedPage) {
      return false;
    }

    return !opportunity.quick_win;
  }

  private buildReviewNotes(opportunity: GscStrategistOpportunity): string {
    const queries = opportunity.target_queries.join(', ');
    return [
      `GSC strategist opportunity (priority ${opportunity.priority_score}).`,
      `Queries: ${queries}.`,
      opportunity.quick_win ? 'Quick win: yes.' : 'Quick win: no.',
      opportunity.why_this_matters,
      'Approve to create a page, then POST /content-ideas/:ideaId/create-task to start generation.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private async ensureGscSubject(siteId: number, language: ContentLanguage): Promise<number> {
    const existing = await this.prisma.subject.findFirst({
      where: { siteId, title: GSC_SUBJECT_TITLE },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    const created = await this.prisma.subject.create({
      data: {
        siteId,
        title: GSC_SUBJECT_TITLE,
        description:
          'Auto-generated content opportunities from Google Search Console (heuristic + LLM strategist).',
        primaryKeywords: [],
        secondaryKeywords: [],
        language,
        seoGoal: 'Expand topical coverage based on proven GSC performance signals',
        status: SubjectStatus.ACTIVE,
      },
    });
    return created.id;
  }

  private normalizeSlug(title: string, keyword: string): string {
    const base =
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) ||
      keyword
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 80);

    return base.startsWith('/') ? base : `/${base}`;
  }

  private parseIntent(value: string): KeywordIntent {
    const upper = value.toUpperCase();
    if (Object.values(KeywordIntent).includes(upper as KeywordIntent)) {
      return upper as KeywordIntent;
    }
    if (upper.includes('COMMERCIAL') || upper.includes('TRANSACTION')) {
      return KeywordIntent.COMMERCIAL;
    }
    if (upper.includes('NAVIG')) {
      return KeywordIntent.NAVIGATIONAL;
    }
    return KeywordIntent.INFORMATIONAL;
  }

  private parseContentType(value: string): ContentType {
    const normalized = value.toLowerCase().replace(/-/g, '_');
    const map: Record<string, ContentType> = {
      blog: ContentType.BLOG_POST,
      blog_post: ContentType.BLOG_POST,
      landing_page: ContentType.LANDING_PAGE,
      landing: ContentType.LANDING_PAGE,
      comparison: ContentType.COMPARISON,
      guide: ContentType.ARTICLE,
      article: ContentType.ARTICLE,
      faq: ContentType.FAQ,
    };
    return map[normalized] ?? ContentType.ARTICLE;
  }

  private resolveModel(provider: AiProvider): string {
    switch (provider) {
      case AiProvider.openai:
        return process.env.AI_IDEA_OPENAI_MODEL ?? 'gpt-4o-mini';
      case AiProvider.anthropic:
        return process.env.AI_IDEA_ANTHROPIC_MODEL ?? 'claude-3-5-haiku-20241022';
      case AiProvider.google:
      default:
        return DEFAULT_GEMINI_MODEL;
    }
  }
}
