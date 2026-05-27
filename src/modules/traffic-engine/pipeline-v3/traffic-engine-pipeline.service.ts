import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { PipelineStatus, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CostControllerService } from '../ai/execution/cost-controller.service';
import { SiteConfigService } from '../config/site-config.service';
import { ContentPolicyEngineService } from '../intelligence/content-policy-engine.service';
import { ClusterBuilderService } from '../intelligence/keyword-intelligence/cluster-builder.service';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';
import { hasBlockingAuditFailure } from '../audit/dto/audit-content.dto';
import { AnalysisResult, AnalysisService } from './analysis.service';
import { GenerationService } from './generation.service';
import { ImageGenerationService } from './image-generation.service';
import {
  PipelineCheckpoint,
  PipelineCheckpointService,
} from './pipeline-checkpoint.service';
import { RewriteService } from './rewrite.service';
import { SeoCheckService } from './seo-check.service';
import { PublishService } from '../publishing/publish.service';
import { InternalLinkingService } from '../intelligence/internal-linking.service';
import { GeoScoreResult, GeoScoringService } from '../seo-strategy/geo-scoring.service';
import { SchemaMarkupService } from '../seo-strategy/schema-markup.service';
import { OriginalityCheckerService } from '../intelligence/originality-checker.service';
import { ErrorTrackerService } from '../observability/error-tracker.service';
import {
  clampMetaDescription,
  clampMetaTitle,
  ensureKeywordInH1,
  h1ContainsKeyword,
  META_DESC_MAX,
  META_DESC_MIN,
  META_TITLE_MAX,
  META_TITLE_MIN,
} from './seo-gate.utils';

/** Merge `contentTask.payload` (POST body) with site context for v3 generate prompts. */
function mergeContentTaskRuntimeContext(
  site: { name: string; domain: string },
  payload: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { siteName: site.name, domain: site.domain };
  }
  const p = payload as Record<string, unknown>;
  return {
    ...p,
    siteName:
      typeof p.siteName === 'string' && p.siteName.trim() ? p.siteName : site.name,
    domain: site.domain,
  };
}

@Injectable()
export class TrafficEnginePipelineService {
  private readonly logger = new Logger(TrafficEnginePipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteConfigService: SiteConfigService,
    private readonly costController: CostControllerService,
    private readonly policyEngine: ContentPolicyEngineService,
    private readonly checkpointService: PipelineCheckpointService,
    private readonly clusterBuilder: ClusterBuilderService,
    private readonly generationService: GenerationService,
    private readonly analysisService: AnalysisService,
    private readonly rewriteService: RewriteService,
    private readonly imageGenerationService: ImageGenerationService,
    private readonly seoCheckService: SeoCheckService,
    private readonly geoScoringService: GeoScoringService,
    private readonly schemaMarkupService: SchemaMarkupService,
    private readonly publishService: PublishService,
    private readonly internalLinking: InternalLinkingService,
    private readonly originalityChecker: OriginalityCheckerService,
    private readonly errorTracker: ErrorTrackerService,
  ) {}

  async run(pageId: number, contentTaskId?: number): Promise<void> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true, keyword: true },
    });
    if (!page || !page.keyword) {
      throw new UnprocessableEntityException('Page or keyword missing');
    }

    const config = await this.siteConfigService.getForPage(pageId);
    const checkpoint = await this.checkpointService.load(pageId);
    const completedSteps = new Set(checkpoint?.completedSteps ?? []);

    const contentTask = contentTaskId
      ? await this.prisma.contentTask.findUnique({ where: { id: contentTaskId } })
      : null;
    const generationRuntime = mergeContentTaskRuntimeContext(
      { name: page.site.name, domain: page.site.domain },
      contentTask?.payload ?? null,
    );

    // Build keyword cluster — deterministic and cached
    const cluster = await this.clusterBuilder.buildCluster(page.keyword.id, page.siteId);
    const priority = page.keyword.priority;

    const isResume = checkpoint !== null && completedSteps.has('generate');
    const persistedSource = isResume
      ? (page.finalContent ?? page.rawDraft ?? '')
      : (page.rawDraft ?? '');
    let draft = persistedSource ? cleanMarkdownOutput(persistedSource) : '';
    let outline = (page.outline as Record<string, unknown> | null) ?? { h2s: [] };
    let analysis: AnalysisResult | null = null;
    let geoScore: GeoScoreResult | null =
      typeof page.geoScore === 'number'
        ? {
            total: page.geoScore,
            pillars: (page.geoScorePillars as unknown as {
              evidenceDensity?: number;
              structurePosition?: number;
              authoritySignals?: number;
              aiCrawlability?: number;
            }) && {
              evidenceDensity: Number((page.geoScorePillars as Record<string, unknown>)?.evidenceDensity ?? 0),
              structurePosition: Number((page.geoScorePillars as Record<string, unknown>)?.structurePosition ?? 0),
              authoritySignals: Number((page.geoScorePillars as Record<string, unknown>)?.authoritySignals ?? 0),
              aiCrawlability: Number((page.geoScorePillars as Record<string, unknown>)?.aiCrawlability ?? 0),
            },
            vetoes: [],
          }
        : null;

    try {
      if (!completedSteps.has('generate')) {
        await this.setStatus(pageId, PipelineStatus.GENERATING, contentTaskId, 'generate');
        const generated = await this.runWithRetry(
          () =>
            this.generationService.generate(
              pageId,
              page.siteId,
              config,
              generationRuntime,
              cluster,
              priority,
            ),
          config.runtimeConfig.maxRetries,
        );
        draft = generated.draft;
        outline = generated.outline;
        await this.saveCheckpoint(pageId, completedSteps, 'generate', true);
      }

      if (config.runtimeConfig.enableAnalysis && !completedSteps.has('validate')) {
        await this.setStatus(pageId, PipelineStatus.VALIDATING, contentTaskId, 'validate');
        const validation = this.policyEngine.validate(draft);
        if (!validation.passed) {
          throw new Error(
            `POLICY_VIOLATION:${validation.violations.map((v) => v.code).join(',')}`,
          );
        }
        // Originality n-gram check vs. existing site pages
        const originalityResult = await this.originalityChecker.check(page.siteId, draft, pageId);
        if (!originalityResult.passed) {
          throw new Error(
            `ORIGINALITY_CHECK_FAILED:overlap=${(originalityResult.overlapRatio * 100).toFixed(1)}%:matched=${originalityResult.matchedSlug ?? 'unknown'}`,
          );
        }
        await this.saveCheckpoint(pageId, completedSteps, 'validate', true);
      }

      if (config.runtimeConfig.enableAnalysis && !completedSteps.has('analyze')) {
        if ((await this.costController.getDowngradeAction(page.siteId)) === 'skip_analysis') {
          await this.setStatus(pageId, PipelineStatus.SKIPPED_STEP, contentTaskId, 'analyze');
        } else {
          await this.setStatus(pageId, PipelineStatus.ANALYZING, contentTaskId, 'analyze');
          analysis = await this.runWithRetry(
            () =>
              this.analysisService.analyze(
                pageId,
                page.siteId,
                draft,
                outline,
                cluster,
                priority,
                config,
              ),
            config.runtimeConfig.maxRetries,
          );
          await this.saveCheckpoint(pageId, completedSteps, 'analyze', true);
        }
      }

      if (config.runtimeConfig.enableAnalysis && !completedSteps.has('geo_score')) {
        await this.setStatus(pageId, PipelineStatus.GEO_SCORING, contentTaskId, 'geo_score');
        const schemaMarkup = this.schemaMarkupService.generate(
          this.schemaInput(page, draft, cluster),
        );
        geoScore = this.geoScoringService.score(draft, schemaMarkup, cluster.primaryKeyword);
        await this.prisma.page.update({
          where: { id: pageId },
          data: {
            schemaMarkup: schemaMarkup as Prisma.InputJsonValue,
            geoScore: geoScore.total,
            geoScorePillars: geoScore.pillars as unknown as Prisma.InputJsonValue,
            pipelineStatus: PipelineStatus.GEO_SCORING,
          },
        });
        await this.saveCheckpoint(pageId, completedSteps, 'geo_score', true);
      }

      if (
        config.runtimeConfig.enableRewrite &&
        geoScore !== null &&
        geoScore.total < 60 &&
        !completedSteps.has('adversarial_stress_test')
      ) {
        const antiPatterns = this.geoScoringService.detectAdversarialAntiPatterns(
          draft,
          cluster.primaryKeyword,
        );
        await this.setStatus(
          pageId,
          PipelineStatus.REWRITING,
          contentTaskId,
          'adversarial_stress_test',
        );
        if (antiPatterns.length >= 2) {
          draft = await this.runWithRetry(
            () =>
              this.rewriteService.runAdversarialStressRewrite(
                pageId,
                page.siteId,
                draft,
                cluster,
                priority,
                antiPatterns,
              ),
            config.runtimeConfig.maxRetries,
          );
        } else {
          await this.setStatus(
            pageId,
            PipelineStatus.SKIPPED_STEP,
            contentTaskId,
            'adversarial_stress_test',
          );
        }
        await this.saveCheckpoint(pageId, completedSteps, 'adversarial_stress_test', true);
      }

      let finalContent = draft;
      const shouldRewrite =
        config.runtimeConfig.enableRewrite &&
        analysis !== null &&
        (analysis.seoScore < config.qualityThreshold ||
          analysis.keywordCoverageScore < 0.6 ||
          analysis.genericContentScore >= 68 ||
          analysis.eeatSignalScore < 52);

      if (shouldRewrite) {
        await this.setStatus(pageId, PipelineStatus.REWRITING, contentTaskId, 'rewrite');
        finalContent = await this.runWithRetry(
          () =>
            this.rewriteService.rewrite(
              pageId,
              page.siteId,
              draft,
              analysis as AnalysisResult,
              cluster,
              priority,
              config,
            ),
          config.runtimeConfig.maxRetries,
        );
        await this.saveCheckpoint(pageId, completedSteps, 'rewrite', true);
      } else if (config.runtimeConfig.enableRewrite) {
        await this.setStatus(pageId, PipelineStatus.SKIPPED_STEP, contentTaskId, 'rewrite');
      }

      if (
        config.runtimeConfig.enableImageGeneration &&
        !completedSteps.has('image_generation')
      ) {
        await this.setStatus(
          pageId,
          PipelineStatus.IMAGE_GENERATING,
          contentTaskId,
          'image_generation',
        );
        await this.runWithRetry(
          () =>
            this.imageGenerationService.generate(
              pageId,
              page.siteId,
              finalContent,
              cluster.primaryKeyword,
              priority,
              cluster.intent,
            ),
          config.runtimeConfig.maxRetries,
        );
        await this.saveCheckpoint(pageId, completedSteps, 'image_generation', true);
      }

      if (
        config.runtimeConfig.enableSeoCheck &&
        !completedSteps.has('seo_check')
      ) {
        await this.setStatus(
          pageId,
          PipelineStatus.SEO_CHECKING,
          contentTaskId,
          'seo_check',
        );

        if (!h1ContainsKeyword(finalContent, cluster.primaryKeyword)) {
          const autoFixed = ensureKeywordInH1(finalContent, cluster.primaryKeyword);
          if (autoFixed) {
            finalContent = autoFixed;
            await this.prisma.page.update({
              where: { id: pageId },
              data: {
                finalContent: autoFixed,
                rawDraft: autoFixed,
                wordCount: autoFixed.split(/\s+/).filter(Boolean).length,
              },
            });
            this.logger.log({ msg: 'seo_gate_h1_auto_fixed_before_audit', pageId });
          }
        }

        const skipYmylAudit =
          contentTask?.payload != null &&
          typeof contentTask.payload === 'object' &&
          !Array.isArray(contentTask.payload) &&
          (contentTask.payload as Record<string, unknown>).skipYmylAudit === true;

        const seoResult = await this.runWithRetry(
          () =>
            this.seoCheckService.check(
              pageId,
              page.siteId,
              finalContent,
              cluster,
              priority,
              cluster.intent,
              skipYmylAudit,
            ),
          config.runtimeConfig.maxRetries,
        );
        finalContent = seoResult.finalContent;

        const minSeoScore = config.runtimeConfig.minSeoCheckScore ?? 50;
        // Multi-signal deterministic SEO gate
        const seoViolations: string[] = [];
        if (seoResult.score < minSeoScore) {
          seoViolations.push(`score:${seoResult.score}<${minSeoScore}`);
        }
        if (!seoResult.passed) {
          seoViolations.push('llm_check_not_passed');
        }
        if (
          hasBlockingAuditFailure(seoResult.auditResult) &&
          !seoResult.initiallyApproved
        ) {
          seoViolations.push('audit_not_approved');
        } else if (seoResult.initiallyApproved && !seoResult.auditResult.approved) {
          this.logger.warn({
            msg: 'seo_gate_audit_human_review_pass',
            pageId,
            eeat_score: seoResult.auditResult.eeat_score,
          });
        } else if (seoResult.auditResult.auditUnavailable) {
          this.logger.warn({
            msg: 'seo_gate_audit_unavailable_skipped',
            pageId,
            reason: seoResult.auditResult.critical_errors.slice(0, 200),
          });
        } else if (!seoResult.auditResult.approved) {
          this.logger.warn({
            msg: 'seo_gate_audit_soft_pass',
            pageId,
            eeat_score: seoResult.auditResult.eeat_score,
          });
        }
        if (!h1ContainsKeyword(finalContent, cluster.primaryKeyword)) {
          const h1Line = finalContent.match(/^#\s+(.+)$/m);
          if (h1Line) {
            seoViolations.push('keyword_not_in_h1');
          }
        }
        // Meta title/description length checks (auto-clamp before gate, like H1 fix)
        let pageForGate = await this.prisma.page.findUnique({
          where: { id: pageId },
          select: { metaTitle: true, metaDescription: true },
        });
        if (pageForGate) {
          const metaUpdates: { metaTitle?: string; metaDescription?: string } = {};
          if (pageForGate.metaTitle) {
            const clampedTitle = clampMetaTitle(pageForGate.metaTitle);
            if (clampedTitle !== pageForGate.metaTitle) {
              metaUpdates.metaTitle = clampedTitle;
            }
          }
          if (pageForGate.metaDescription) {
            const clampedDesc = clampMetaDescription(pageForGate.metaDescription);
            if (clampedDesc !== pageForGate.metaDescription) {
              metaUpdates.metaDescription = clampedDesc;
            }
          }
          if (Object.keys(metaUpdates).length > 0) {
            await this.prisma.page.update({ where: { id: pageId }, data: metaUpdates });
            pageForGate = { ...pageForGate, ...metaUpdates };
            this.logger.log({
              msg: 'seo_gate_meta_auto_fixed',
              pageId,
              metaTitleLength: pageForGate.metaTitle?.length,
              metaDescriptionLength: pageForGate.metaDescription?.length,
            });
          }
        }
        if (pageForGate?.metaTitle) {
          const mtLen = pageForGate.metaTitle.length;
          if (mtLen < META_TITLE_MIN || mtLen > META_TITLE_MAX) {
            seoViolations.push(`meta_title_length:${mtLen}`);
          }
        }
        if (pageForGate?.metaDescription) {
          const mdLen = pageForGate.metaDescription.length;
          if (mdLen < META_DESC_MIN || mdLen > META_DESC_MAX) {
            seoViolations.push(`meta_desc_length:${mdLen}`);
          }
        }
        if (seoViolations.length > 0) {
          throw new Error(`SEO_GATE_FAILED:${seoViolations.join(',')}`);
        }
        await this.saveCheckpoint(pageId, completedSteps, 'seo_check', true);
      }

      const pillarPageId = await this.resolvePillarPageId(page.siteId, page.keyword.keyword);

      if (
        (config.runtimeConfig.enableInternalLinking ?? true) &&
        !completedSteps.has('internal_linking')
      ) {
        await this.setStatus(pageId, PipelineStatus.REWRITING, contentTaskId, 'internal_linking');
        const linkResult = await this.internalLinking.enrichContent(
          page.siteId,
          pageId,
          finalContent,
          cluster.primaryKeyword,
          cluster.secondaryKeywords.map((k) => k.keyword),
          { maxLinks: 5, pillarPageId },
        );
        finalContent = linkResult.content;
        await this.saveCheckpoint(pageId, completedSteps, 'internal_linking', true);
      }

      // final_geo_schema runs AFTER internal linking so schema/GEO reflect the full final body
      if (!completedSteps.has('final_geo_schema')) {
        await this.setStatus(pageId, PipelineStatus.GEO_SCORING, contentTaskId, 'final_geo_schema');
        const refreshed = await this.prisma.page.findUnique({
          where: { id: pageId },
          include: { site: true },
        });
        if (refreshed) {
          geoScore = await this.persistGeoAndSchema(refreshed, finalContent, cluster);
        }
        await this.saveCheckpoint(pageId, completedSteps, 'final_geo_schema', true);
      }

      finalContent = cleanMarkdownOutput(finalContent);
      const markdownViolations = this.validateMarkdownStructure(finalContent);
      if (markdownViolations.length > 0) {
        throw new Error(`MARKDOWN_VALIDATION_FAILED:${markdownViolations.join(',')}`);
      }

      await this.prisma.page.update({
        where: { id: pageId },
        data: {
          finalContent,
          pipelineStatus: PipelineStatus.READY,
          pipelineCheckpoint: Prisma.JsonNull,
        },
      });
      await this.checkpointService.clear(pageId);
      await this.markTaskCompleted(contentTaskId);

      this.logger.log({ msg: 'pipeline_v3_completed', pageId, cluster: cluster.topic });

      // Auto-publish if the site is configured for it (non-blocking — fire and log)
      if (page.site.autoPublish !== false) {
        this.publishService.publishPage(pageId).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn({ msg: 'auto_publish_failed', pageId, error: message });
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'pipeline_v3_failed', pageId, message });
      const checkpoint = await this.checkpointService.load(pageId);
      this.errorTracker.track(error, {
        pageId,
        siteId: page.siteId,
        siteDomain: page.site.domain,
        step: checkpoint?.lastStep ?? 'unknown',
        source: 'pipeline',
      });
      const status = draft ? PipelineStatus.PARTIALLY_COMPLETED : PipelineStatus.FAILED;
      await this.prisma.page.update({
        where: { id: pageId },
        data: {
          pipelineStatus: status,
          pipelineCheckpoint: ((await this.checkpointService.load(pageId)) as unknown) as Prisma.InputJsonValue,
        },
      });
      if (contentTaskId) {
        await this.prisma.contentTask.update({
          where: { id: contentTaskId },
          data: {
            status: TaskStatus.FAILED,
            errorLog: message,
            failedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
          },
        });
      }
      throw error;
    }
  }

  private async runWithRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        if (attempt >= maxRetries) {
          throw error;
        }
        const delay = 200 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt += 1;
      }
    }
  }

  private schemaInput(
    page: {
      slug: string;
      title: string | null;
      metaDescription: string | null;
      language?: string;
      createdAt: Date;
      updatedAt: Date;
      site: { domain: string; name: string; config?: unknown };
    },
    content: string,
    cluster: KeywordClusterData,
  ) {
    const siteConfig = (page.site.config ?? {}) as Record<string, unknown>;
    const authorPersona = siteConfig.authorPersona as { name?: string; url?: string; sameAs?: string[] } | undefined;
    return {
      slug: page.slug,
      title: page.title,
      metaDescription: page.metaDescription,
      finalContent: content,
      keyword: cluster.primaryKeyword,
      intent: cluster.intent,
      domain: page.site.domain,
      siteName: page.site.name,
      language: (page.language ?? 'en').toLowerCase(),
      datePublished: page.createdAt,
      dateModified: page.updatedAt,
      authorPersona: authorPersona ?? null,
    };
  }

  private async persistGeoAndSchema(
    page: {
      id: number;
      slug: string;
      title: string | null;
      metaDescription: string | null;
      language?: string;
      createdAt: Date;
      updatedAt: Date;
      site: { domain: string; name: string; config?: unknown };
    },
    finalContent: string,
    cluster: KeywordClusterData,
  ): Promise<GeoScoreResult> {
    const schemaMarkup = this.schemaMarkupService.generate(
      this.schemaInput(page, finalContent, cluster),
    );
    const geoScore = this.geoScoringService.score(
      finalContent,
      schemaMarkup,
      cluster.primaryKeyword,
    );
    await this.prisma.page.update({
      where: { id: page.id },
      data: {
        schemaMarkup: schemaMarkup as Prisma.InputJsonValue,
        geoScore: geoScore.total,
        geoScorePillars: geoScore.pillars as unknown as Prisma.InputJsonValue,
      },
    });
    return geoScore;
  }

  private async resolvePillarPageId(siteId: number, keyword: string): Promise<number | null> {
    const subject = await this.prisma.subject.findFirst({
      where: {
        siteId,
        OR: [
          { primaryKeywords: { has: keyword } },
          { secondaryKeywords: { has: keyword } },
        ],
        pillarPageId: { not: null },
      },
      select: { pillarPageId: true },
    });
    return subject?.pillarPageId ?? null;
  }

  private async saveCheckpoint(
    pageId: number,
    completedSteps: Set<string>,
    step: string,
    draftSaved: boolean,
  ): Promise<void> {
    completedSteps.add(step);
    const checkpoint: PipelineCheckpoint = {
      completedSteps: [...completedSteps] as PipelineCheckpoint['completedSteps'],
      lastStep: step as PipelineCheckpoint['lastStep'],
      draftSaved,
    };
    await this.checkpointService.save(pageId, checkpoint);
  }

  private async setStatus(
    pageId: number,
    status: PipelineStatus,
    contentTaskId?: number,
    currentStep?: string,
  ): Promise<void> {
    await this.prisma.page.update({ where: { id: pageId }, data: { pipelineStatus: status } });
    if (contentTaskId) {
      await this.prisma.contentTask.update({
        where: { id: contentTaskId },
        data: { currentStep: currentStep ?? null },
      });
    }
  }

  private async markTaskCompleted(contentTaskId?: number): Promise<void> {
    if (!contentTaskId) {
      return;
    }
    await this.prisma.contentTask.update({
      where: { id: contentTaskId },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        currentStep: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async buildClusterForKeyword(primaryKeywordId: number, siteId: number): Promise<KeywordClusterData> {
    return this.clusterBuilder.buildCluster(primaryKeywordId, siteId);
  }

  /**
   * Lightweight path for REFRESH_TITLE_META tasks.
   * Re-generates only title, metaTitle, metaDescription, and H1 using the seo_check model.
   * Does not regenerate the body or run the full pipeline.
   */
  async runRefreshTitleMeta(pageId: number, contentTaskId?: number): Promise<void> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true, keyword: true },
    });
    if (!page?.keyword || !page.finalContent) {
      throw new UnprocessableEntityException('Page, keyword, or finalContent missing for refresh');
    }

    await this.setStatus(pageId, PipelineStatus.SEO_CHECKING, contentTaskId, 'refresh_title_meta');

    const cluster = await this.clusterBuilder.buildCluster(page.keyword.id, page.siteId);
    const config = await this.siteConfigService.getForPage(pageId);

    const seoResult = await this.seoCheckService.check(
      pageId,
      page.siteId,
      page.finalContent,
      cluster,
      page.keyword.priority,
      cluster.intent,
      true,
    );

    if (seoResult.improvedContent) {
      // Extract new H1 and meta from improved content for title/meta update only
      const h1Match = seoResult.finalContent.match(/^#\s+(.+)$/m);
      const newTitle = h1Match ? h1Match[1].trim() : undefined;

      await this.prisma.page.update({
        where: { id: pageId },
        data: {
          ...(newTitle ? { title: newTitle, metaTitle: clampMetaTitle(newTitle) } : {}),
          pipelineStatus: PipelineStatus.READY,
        },
      });
    } else {
      await this.prisma.page.update({
        where: { id: pageId },
        data: { pipelineStatus: PipelineStatus.READY },
      });
    }

    await this.markTaskCompleted(contentTaskId);
    if (config.runtimeConfig.minSeoCheckScore) {
      this.logger.log({ msg: 'refresh_title_meta_done', pageId, seoScore: seoResult.score });
    }
  }

  private validateMarkdownStructure(content: string): string[] {
    const violations: string[] = [];
    if (content.includes('\\n')) {
      violations.push('escaped_newline_detected');
    }
    if (!/^#\s+/m.test(content)) {
      violations.push('missing_h1');
    }
    const h2Count = (content.match(/^##\s+/gm) ?? []).length;
    if (h2Count < 2) {
      violations.push('insufficient_h2_sections');
    }
    return violations;
  }
}
