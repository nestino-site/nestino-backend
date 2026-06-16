import { Injectable } from '@nestjs/common';
import { Prisma, Subject } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SeoBriefBuilder } from '../brief/seo-brief.builder';
import { SiteConfigRecord } from '../config/config.types';
import { KnowledgeBaseService } from '../intelligence/knowledge-base.service';
import { TopicalClusterService } from '../intelligence/topical-cluster.service';
import { AiExecutionService } from '../ai/execution/ai-execution.service';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';
import { OutlineSchema, safeParse } from '../ai/schemas/structured-output.schemas';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';
import {
  extractGuideGeoFromPage,
  filterSecondaryKeywordsByGeo,
  GuideGeoContext,
} from '../content-api/seo/guide-geo.util';

export interface GenerationResult {
  outline: Record<string, unknown>;
  draft: string;
  wordCount: number;
}

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiExecution: AiExecutionService,
    private readonly briefBuilder: SeoBriefBuilder,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly topicalCluster: TopicalClusterService,
  ) {}

  async generate(
    pageId: number,
    siteId: number,
    _config: SiteConfigRecord,
    runtimeContext: Record<string, unknown>,
    cluster: KeywordClusterData,
    priority: number,
  ): Promise<GenerationResult> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true, keyword: true },
    });
    if (!page?.keyword) {
      throw new Error('Page or keyword missing for generation');
    }

    const guideGeo = extractGuideGeoFromPage({
      slug: page.slug,
      title: page.title,
    });
    const subject = await this.resolveSubjectForPage(
      siteId,
      page.keyword.keyword,
      guideGeo,
    );
    const filteredSecondaryKeywords = filterSecondaryKeywordsByGeo(
      cluster.secondaryKeywords.map((k) => k.keyword),
      guideGeo,
    );

    const brief = await this.briefBuilder.build(page.site, page.keyword, page, {
      clusterSecondaryKeywords: filteredSecondaryKeywords,
      template: subject?.template ?? null,
      pillarPageId: subject?.pillarPageId ?? null,
    });

    // Enrich topical cluster from SERP entities (non-blocking; fire-and-forget)
    this.topicalCluster
      .enrichFromSerp(siteId, page.keyword.keyword, page.keyword.language)
      .catch(() => null);

    const clusterContext = this.buildClusterContext(cluster, filteredSecondaryKeywords);
    const geoRuntime = this.buildGeoRuntimeContext(guideGeo, page, runtimeContext);
    let mergedRuntime = this.knowledgeBase.mergeIntoRuntime(page.site, {
      ...runtimeContext,
      ...clusterContext,
      ...geoRuntime,
      seoBrief: brief,
      targetWordCount: brief.targetWordCount,
      requiredSections: brief.requiredSections,
      paaQuestions: brief.paaQuestions,
      internalLinkTargets: brief.internalLinkTargets,
      serpEntities: brief.serpEntities,
      hasAiOverview: brief.hasAiOverview,
      hasFaqFeature: brief.hasFaqFeature,
      // Template formatting fields for prompt injection
      templateFormattingInstructions: brief.templateFormatting?.formattingInstructions,
      templateSeoRules: brief.templateFormatting?.seoRules,
      templateInternalLinkingRules: brief.templateFormatting?.internalLinkingRules,
    });

    const outlineOutput = await this.aiExecution.execute({
      step: 'generate',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: { ...mergedRuntime, mode: 'outline' },
      maxOutputTokens: 900,
    });

    let outline: Record<string, unknown>;
    const parsedOutline = safeParse(OutlineSchema, outlineOutput.text);
    if (parsedOutline) {
      outline = parsedOutline as Record<string, unknown>;
    } else {
      // Fallback: try raw JSON parse, then degrade gracefully
      try {
        outline = JSON.parse(outlineOutput.text) as Record<string, unknown>;
      } catch {
        outline = { h2s: [], raw: outlineOutput.text };
      }
    }

    mergedRuntime = {
      ...mergedRuntime,
      mode: 'draft',
      briefJson: outline,
    };

    const draftOutput = await this.aiExecution.execute({
      step: 'generate',
      siteId,
      pageId,
      priority,
      intent: cluster.intent,
      runtimeContext: mergedRuntime,
      maxOutputTokens: 2600,
    });

    const draft = cleanMarkdownOutput(draftOutput.text);
    const wordCount = draft.split(/\s+/).filter(Boolean).length;

    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        outline: outline as Prisma.InputJsonValue,
        rawDraft: draft,
        wordCount,
        pipelineStatus: 'GENERATING',
        pipelineVersion: 3,
      },
    });

    return { outline, draft, wordCount };
  }

  private buildClusterContext(
    cluster: KeywordClusterData,
    secondaryKeywords: string[],
  ): Record<string, unknown> {
    return {
      keyword: cluster.primaryKeyword,
      topic: cluster.topic,
      intent: cluster.intent,
      semanticTopics: cluster.semanticTopics,
      secondaryKeywords,
    };
  }

  private buildGeoRuntimeContext(
    guideGeo: GuideGeoContext,
    page: { slug: string; title: string | null },
    runtimeContext: Record<string, unknown>,
  ): Record<string, unknown> {
    const geoRuntime: Record<string, unknown> = {
      pageSlug: page.slug,
      pageTitle: page.title ?? undefined,
    };

    if (guideGeo.location && !runtimeContext.location) {
      geoRuntime.location = guideGeo.location;
    }
    if (guideGeo.geoConstraint) {
      geoRuntime.geoConstraint = guideGeo.geoConstraint;
    }
    if (guideGeo.cityName) {
      geoRuntime.city = guideGeo.cityName;
    }
    if (guideGeo.countryName) {
      geoRuntime.country = guideGeo.countryName;
    }

    const existingInstructions =
      typeof runtimeContext.seo_instructions === 'string'
        ? runtimeContext.seo_instructions.trim()
        : '';
    if (guideGeo.geoConstraint) {
      geoRuntime.seo_instructions = existingInstructions
        ? `${existingInstructions}\n\n${guideGeo.geoConstraint}`
        : guideGeo.geoConstraint;
    }

    return geoRuntime;
  }

  private async resolveSubjectForPage(
    siteId: number,
    keyword: string,
    guideGeo: GuideGeoContext,
  ) {
    const keywordMatch = guideGeo.isCityGuide
      ? {
          OR: [{ primaryKeywords: { has: keyword } }],
        }
      : {
          OR: [
            { primaryKeywords: { has: keyword } },
            { secondaryKeywords: { has: keyword } },
          ],
        };

    const candidates = await this.prisma.subject.findMany({
      where: {
        siteId,
        ...keywordMatch,
      },
      include: { template: true },
      orderBy: [{ id: 'asc' }],
    });

    if (candidates.length === 0) {
      return null;
    }

    const ranked = candidates
      .map((subject) => ({
        subject,
        score: this.scoreSubjectMatch(subject, keyword, guideGeo),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.subject.id - b.subject.id);

    return ranked[0]?.subject ?? null;
  }

  private scoreSubjectMatch(
    subject: Subject,
    keyword: string,
    guideGeo: GuideGeoContext,
  ): number {
    let score = 0;

    if (subject.primaryKeywords.includes(keyword)) {
      score += 20;
    } else if (subject.secondaryKeywords.includes(keyword)) {
      score += guideGeo.isCityGuide ? 0 : 8;
    } else {
      return 0;
    }

    const subjectCity = subject.city?.trim().toLowerCase();
    const subjectCountry = subject.country?.trim().toLowerCase();
    const targetCity = guideGeo.cityName?.trim().toLowerCase();
    const targetCountry = guideGeo.countryName?.trim().toLowerCase();

    if (guideGeo.isCityGuide && targetCity) {
      if (subjectCity === targetCity) {
        score += 100;
      } else if (subjectCity && subjectCity !== targetCity) {
        score -= 80;
      } else if (!subjectCity) {
        score -= 40;
      }
    }

    if (targetCountry) {
      if (subjectCountry === targetCountry) {
        score += 50;
      } else if (subjectCountry && subjectCountry !== targetCountry) {
        score -= 100;
      }
    }

    return score;
  }
}
