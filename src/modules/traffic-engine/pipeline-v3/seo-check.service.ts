import { Injectable, Logger } from '@nestjs/common';
import { KeywordIntent, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiExecutionService } from '../ai/execution/ai-execution.service';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';
import { SeoCheckSchema, safeParse } from '../ai/schemas/structured-output.schemas';
import { cleanMarkdownOutput } from '../utils/markdown-cleaner';
import { collectDeterministicSeoIssues } from './seo-gate.utils';

export interface SeoCheckResult {
  passed: boolean;
  score: number;
  issues: string[];
  googleChecklist?: Record<string, boolean>;
  /** Non-null when SEO issues were found and a fix pass was applied. */
  improvedContent: string | null;
}

@Injectable()
export class SeoCheckService {
  private readonly logger = new Logger(SeoCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiExecution: AiExecutionService,
  ) {}

  async check(
    pageId: number,
    siteId: number,
    finalContent: string,
    cluster: KeywordClusterData,
    priority: number,
    intent: KeywordIntent,
  ): Promise<SeoCheckResult> {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) {
      throw new Error('Page not found for seo_check');
    }

    // ── Phase 1: Evaluate ──────────────────────────────────────────────────
    const evalOutput = await this.aiExecution.execute({
      step: 'seo_check',
      siteId,
      pageId,
      priority,
      intent,
      runtimeContext: {
        finalContent,
        keyword: cluster.primaryKeyword,
        metaDescription: page.metaDescription,
        title: page.title,
        schemaMarkup: page.schemaMarkup,
        geoScore: page.geoScore,
        geoScorePillars: page.geoScorePillars,
      },
      maxOutputTokens: 1000,
    });

    const validated = safeParse(SeoCheckSchema, evalOutput.text);
    let parsed: Record<string, unknown>;
    if (validated) {
      parsed = validated as Record<string, unknown>;
    } else {
      try {
        parsed = JSON.parse(evalOutput.text) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }

    const passed = parsed.passed === true;
    const rawScore = typeof parsed.score === 'number' ? parsed.score : 0;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const llmIssues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((item): item is string => typeof item === 'string')
      : [];
    const googleChecklist =
      parsed.googleChecklist && typeof parsed.googleChecklist === 'object'
        ? (parsed.googleChecklist as Record<string, boolean>)
        : undefined;

    const deterministicIssues = collectDeterministicSeoIssues(
      finalContent,
      cluster.primaryKeyword,
      { metaTitle: page.metaTitle, metaDescription: page.metaDescription },
    );
    const issues = [...new Set([...llmIssues, ...deterministicIssues])];
    if (deterministicIssues.length > 0) {
      this.logger.log({
        msg: 'seo_check_deterministic_issues',
        pageId,
        issues: deterministicIssues,
      });
    }

    // ── Phase 2: Fix content when issues are identified ────────────────────
    let improvedContent: string | null = null;

    if (issues.length > 0) {
      this.logger.log({
        msg: 'seo_check_fix_pass_started',
        pageId,
        score,
        issueCount: issues.length,
      });

      const seoFixInstructions = [
        'SEO improvement pass — address the following Google SEO issues before publishing.',
        `Current SEO score: ${score}/100. Target: 80+.`,
        `Issues to fix:\n${issues.map((i) => `  - ${i}`).join('\n')}`,
        `Keyword "${cluster.primaryKeyword}": must appear in the H1 and in the opening paragraph.`,
        'Google Helpful Content rules: every section must answer a real user question with concrete, specific information.',
        'E-E-A-T: keep all existing experience signals (numbers, limitations, local anchors, guest-style observations). Do not remove them.',
        'Preserve all existing facts, figures, and claims. Do not invent new ones.',
        'Output clean Markdown only — real line breaks, no HTML, no JSON, no escaped \\n.',
      ].join('\n');

      const fixOutput = await this.aiExecution.execute({
        step: 'rewrite',
        siteId,
        pageId,
        priority,
        intent,
        runtimeContext: {
          draftText: finalContent,
          keyword: cluster.primaryKeyword,
          secondaryKeywords: cluster.secondaryKeywords.map((k) => k.keyword),
          semanticTopics: cluster.semanticTopics,
          analyzeJson: {
            issues: [seoFixInstructions, ...issues],
            missingKeywords: [],
            score,
          },
        },
        maxOutputTokens: 2600,
      });

      improvedContent = cleanMarkdownOutput(fixOutput.text);

      this.logger.log({
        msg: 'seo_check_fix_pass_completed',
        pageId,
        wordCount: improvedContent.split(/\s+/).filter(Boolean).length,
      });
    }

    // ── Persist results ────────────────────────────────────────────────────
    const contentToSave = improvedContent ?? finalContent;
    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        seoCheckScore: score,
        seoCheckPassed: passed,
        seoCheckIssues: ({
          issues,
          googleChecklist: googleChecklist ?? {},
        } as unknown) as Prisma.InputJsonValue,
        ...(improvedContent
          ? {
              finalContent: contentToSave,
              rawDraft: contentToSave,
              wordCount: contentToSave.split(/\s+/).filter(Boolean).length,
            }
          : {}),
      },
    });

    if (!passed) {
      this.logger.warn({
        msg: 'seo_check_not_passed',
        pageId,
        score,
        issues,
        contentImproved: improvedContent !== null,
      });
    }

    return { passed, score, issues, googleChecklist, improvedContent };
  }
}
