import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { PipelineStatus, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CostControllerService } from '../ai/execution/cost-controller.service';
import { SiteConfigService } from '../config/site-config.service';
import { ContentPolicyEngineService } from '../intelligence/content-policy-engine.service';
import { ClusterBuilderService } from '../intelligence/keyword-intelligence/cluster-builder.service';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';
import { AnalysisResult, AnalysisService } from './analysis.service';
import { GenerationService } from './generation.service';
import { ImageGenerationService } from './image-generation.service';
import { PipelineCheckpoint, PipelineCheckpointService } from './pipeline-checkpoint.service';
import { RewriteService } from './rewrite.service';
import { SeoCheckService } from './seo-check.service';
import { PublishService } from '../publishing/publish.service';
import { GeoScoreResult, GeoScoringService } from '../seo-strategy/geo-scoring.service';
import { SchemaMarkupService } from '../seo-strategy/schema-markup.service';

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

    let draft = page.rawDraft ? cleanMarkdownOutput(page.rawDraft) : '';
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
        const schemaMarkup = this.schemaMarkupService.generate({
          slug: page.slug,
          title: page.title,
          metaDescription: page.metaDescription,
          finalContent: draft,
          keyword: cluster.primaryKeyword,
          intent: cluster.intent,
          domain: page.site.domain,
          siteName: page.site.name,
        });
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
        const seoResult = await this.runWithRetry(
          () =>
            this.seoCheckService.check(
              pageId,
              page.siteId,
              finalContent,
              cluster,
              priority,
              cluster.intent,
            ),
          config.runtimeConfig.maxRetries,
        );
        // Use SEO-improved content for the rest of the pipeline (publish)
        if (seoResult.improvedContent) {
          finalContent = seoResult.improvedContent;
        }
        await this.saveCheckpoint(pageId, completedSteps, 'seo_check', true);
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

  private async saveCheckpoint(
    pageId: number,
    completedSteps: Set<
      'generate' | 'validate' | 'analyze' | 'geo_score' | 'adversarial_stress_test' | 'rewrite'
      | 'image_generation'
      | 'seo_check'
    >,
    step:
      | 'generate'
      | 'validate'
      | 'analyze'
      | 'geo_score'
      | 'adversarial_stress_test'
      | 'rewrite'
      | 'image_generation'
      | 'seo_check',
    draftSaved: boolean,
  ): Promise<void> {
    completedSteps.add(step);
    const checkpoint: PipelineCheckpoint = {
      completedSteps: [...completedSteps],
      lastStep: step,
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
