import { Injectable, Logger } from '@nestjs/common';
import { KeywordIntent, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditResult } from '../audit/dto/audit-content.dto';
import { GeminiAuditService } from '../audit/services/gemini-audit.service';
import { AiExecutionService } from '../ai/execution/ai-execution.service';
import { KeywordClusterData } from '../intelligence/keyword-intelligence/keyword-cluster.types';
import { SeoCheckSchema, safeParse } from '../ai/schemas/structured-output.schemas';
import { collectDeterministicSeoIssues } from './seo-gate.utils';

const SKIPPED_AUDIT_RESULT: AuditResult = {
  approved: true,
  eeat_score: 0,
  critical_errors: '',
  seo_and_ux_recommendations: 'YMYL audit skipped (lightweight SEO check).',
  internal_linking_audit: { status: 'approved', details: 'N/A — lightweight mode' },
};

export interface SeoCheckResult {
  passed: boolean;
  score: number;
  issues: string[];
  googleChecklist?: Record<string, boolean>;
  /** Authoritative markdown after audit-and-fix (always set). */
  finalContent: string;
  /** Non-null when content was rewritten by audit fix pass. */
  improvedContent: string | null;
  auditResult: AuditResult;
}

@Injectable()
export class SeoCheckService {
  private readonly logger = new Logger(SeoCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiExecution: AiExecutionService,
    private readonly geminiAudit: GeminiAuditService,
  ) {}

  async check(
    pageId: number,
    siteId: number,
    finalContent: string,
    cluster: KeywordClusterData,
    priority: number,
    intent: KeywordIntent,
    lightweight = false,
  ): Promise<SeoCheckResult> {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) {
      throw new Error('Page not found for seo_check');
    }

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

    if (lightweight) {
      await this.prisma.page.update({
        where: { id: pageId },
        data: {
          seoCheckScore: score,
          seoCheckPassed: passed,
          seoCheckIssues: ({
            issues,
            googleChecklist: googleChecklist ?? {},
          } as unknown) as Prisma.InputJsonValue,
        },
      });

      if (!passed) {
        this.logger.warn({ msg: 'seo_check_not_passed', pageId, score, issues, lightweight: true });
      }

      return {
        passed,
        score,
        issues,
        googleChecklist,
        finalContent,
        improvedContent: null,
        auditResult: SKIPPED_AUDIT_RESULT,
      };
    }

    // ── Full path: YMYL audit + fix (authoritative finalContent) ─────────────
    const auditAndFix = await this.geminiAudit.auditAndImproveContent(finalContent, {
      keyword: cluster.primaryKeyword,
      seoIssues: issues,
      seoScore: score,
    });

    const { auditResult } = auditAndFix;
    const authoritativeContent = auditAndFix.finalContent;

    if (!auditResult.approved) {
      this.logger.warn({
        msg: 'content_audit_not_approved',
        pageId,
        eeat_score: auditResult.eeat_score,
        fixAttempts: auditAndFix.fixAttempts,
        contentChanged: auditAndFix.contentChanged,
        critical_errors: auditResult.critical_errors.slice(0, 500),
      });
    }

    const wordCount = authoritativeContent.split(/\s+/).filter(Boolean).length;
    await this.prisma.page.update({
      where: { id: pageId },
      data: {
        seoCheckScore: score,
        seoCheckPassed: passed,
        seoCheckIssues: ({
          issues,
          googleChecklist: googleChecklist ?? {},
        } as unknown) as Prisma.InputJsonValue,
        contentAuditResult: {
          ...auditResult,
          contentChanged: auditAndFix.contentChanged,
          fixAttempts: auditAndFix.fixAttempts,
        } as unknown as Prisma.InputJsonValue,
        finalContent: authoritativeContent,
        rawDraft: authoritativeContent,
        wordCount,
      },
    });

    if (!passed) {
      this.logger.warn({
        msg: 'seo_check_not_passed',
        pageId,
        score,
        issues,
        contentImproved: auditAndFix.contentChanged,
      });
    }

    return {
      passed,
      score,
      issues,
      googleChecklist,
      finalContent: authoritativeContent,
      improvedContent: auditAndFix.contentChanged ? authoritativeContent : null,
      auditResult,
    };
  }
}
