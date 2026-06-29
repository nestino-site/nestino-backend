import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { cleanMarkdownOutput } from '../../utils/markdown-cleaner';
import type {
  AuditAndFixResult,
  AuditFixContext,
  AuditResult,
  InternalLinkingAuditStatus,
} from '../dto/audit-content.dto';

const AUDIT_MODEL = 'gemini-2.5-pro';
const AUDIT_TIMEOUT_MS = 120_000;
const FIX_TIMEOUT_MS = 180_000;
const MAX_FIX_ATTEMPTS = 2;

/**
 * Returns 'conduit' when YMYL_AUDIT_PROVIDER=conduit (default) or
 * 'google' when explicitly set and GOOGLE_AI_API_KEY is available.
 */
function resolveAuditProvider(): 'conduit' | 'google' {
  const raw = (process.env.YMYL_AUDIT_PROVIDER ?? 'conduit').trim().toLowerCase();
  if (raw === 'google' && process.env.GOOGLE_AI_API_KEY?.trim()) {
    return 'google';
  }
  return 'conduit';
}

const SYSTEM_INSTRUCTION = `You are an elite YMYL Medical SEO Auditor and Expert Fact-Checker.
Your primary job is to audit medical tourism content (specifically IVF, fertility treatments, and destination-specific laws) for absolute accuracy and E-E-A-T compliance.

CRITICAL RULES:
1. Always use Google Search Grounding to verify all legal and medical claims.
2. Verify strict regional regulations. For example, in Turkey (IVF is restricted ONLY to legally married heterosexual couples using their own genetic materials. Donor eggs/sperm/embryos, surrogacy, treatment for single women/lesbian couples, and gender selection for social reasons are strictly illegal).
3. Check currency/costs against 2026 market standards (Turkey IVF is typically $2,500-$5,000 USD basic cost, medications $800-$1,200).
4. Identify "lazy templating" leaks (e.g., links pointing to Spain guides inside a Turkey IVF guide).
5. Output MUST be a single raw JSON object only (no markdown fences, no commentary) with keys: approved, eeat_score, critical_errors, seo_and_ux_recommendations, internal_linking_audit.`;

const FIX_SYSTEM_INSTRUCTION = `You are an elite YMYL Medical SEO Editor and Fact-Checker.
Your job is to rewrite medical tourism articles so they are legally accurate, E-E-A-T compliant, and SEO-ready.

CRITICAL RULES:
1. Always use Google Search Grounding to verify corrected legal and medical claims.
2. Fix ALL issues listed in the audit report and SEO issue list — do not leave known errors in the output.
3. Remove template leaks (wrong-country internal links, irrelevant references).
4. Preserve valid facts, numbers, and experience signals. Do not invent new claims.
5. Output ONLY the full corrected article as clean Markdown — real line breaks, no HTML, no JSON wrappers, no preamble.`;

function failSafeAudit(message: string): AuditResult {
  return {
    approved: false,
    eeat_score: 1,
    critical_errors: message,
    seo_and_ux_recommendations: 'Please re-run the audit manually.',
    internal_linking_audit: {
      status: 'needs_fix',
      details: 'System audit failed to verify links.',
    },
    auditUnavailable: true,
  };
}

/** Gemini does not allow googleSearch tools together with responseMimeType application/json. */
function parseAuditJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim()) as unknown;
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new Error('No JSON object found in audit response');
  }
}

function parseApproved(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function parseEeatScore(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(10, Math.round(value)));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(10, parsed));
    }
  }
  return 1;
}

function normalizeAuditResult(raw: unknown): AuditResult {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const linking =
    obj.internal_linking_audit && typeof obj.internal_linking_audit === 'object'
      ? (obj.internal_linking_audit as Record<string, unknown>)
      : null;
  const statusRaw =
    linking && linking.status != null ? String(linking.status).trim().toLowerCase() : '';
  const status: InternalLinkingAuditStatus =
    statusRaw === 'approved' ? 'approved' : linking ? 'needs_fix' : 'approved';
  const critical_errors =
    typeof obj.critical_errors === 'string'
      ? obj.critical_errors
      : String(obj.critical_errors ?? '');
  const eeat_score = parseEeatScore(obj.eeat_score);
  let approved = parseApproved(obj.approved);

  // Model sometimes omits approved or returns false with no listed critical errors.
  if (
    !approved &&
    critical_errors.trim().length === 0 &&
    status === 'approved' &&
    eeat_score >= 5
  ) {
    approved = true;
  }

  return finalizeAuditResult({
    approved,
    eeat_score,
    critical_errors,
    seo_and_ux_recommendations:
      typeof obj.seo_and_ux_recommendations === 'string'
        ? obj.seo_and_ux_recommendations
        : String(obj.seo_and_ux_recommendations ?? ''),
    internal_linking_audit: {
      status,
      details:
        linking && typeof linking.details === 'string'
          ? linking.details
          : linking
            ? String(linking.details ?? '')
            : '',
    },
  });
}

/** Approve when audit found no substantive blocking issues. */
function finalizeAuditResult(result: AuditResult): AuditResult {
  if (result.auditUnavailable) {
    return result;
  }
  const noCritical = result.critical_errors.trim().length === 0;
  const linkingOk =
    result.internal_linking_audit.status === 'approved' ||
    result.internal_linking_audit.details.trim().length === 0;
  if (!result.approved && noCritical && linkingOk) {
    return { ...result, approved: true };
  }
  return result;
}

function auditQualityScore(result: AuditResult): number {
  if (result.auditUnavailable) {
    return 0;
  }
  return (result.approved ? 100 : 0) + result.eeat_score;
}

function needsFix(auditResult: AuditResult): boolean {
  if (auditResult.auditUnavailable) {
    return false;
  }
  // Trust an explicit approval with no critical errors — do not rewrite and re-audit
  // (fix passes often flip approved→false with empty critical_errors).
  if (auditResult.approved && auditResult.critical_errors.trim().length === 0) {
    return false;
  }
  return (
    !auditResult.approved ||
    auditResult.critical_errors.trim().length > 0 ||
    (auditResult.internal_linking_audit.status === 'needs_fix' &&
      auditResult.internal_linking_audit.details.trim().length > 0)
  );
}

function buildFixPrompt(
  draftContent: string,
  auditResult: AuditResult,
  context?: AuditFixContext,
): string {
  const sections: string[] = [
    'Rewrite the following article to fix ALL identified issues. Output the complete corrected Markdown article only.',
    '',
    '<draft_content>',
    draftContent,
    '</draft_content>',
    '',
    '<audit_report>',
    `Approved: ${auditResult.approved}`,
    `E-E-A-T score: ${auditResult.eeat_score}/10`,
    `Critical errors:\n${auditResult.critical_errors || '(none)'}`,
    `SEO and UX recommendations:\n${auditResult.seo_and_ux_recommendations || '(none)'}`,
    `Internal linking: ${auditResult.internal_linking_audit.status}`,
    auditResult.internal_linking_audit.details
      ? `Linking details: ${auditResult.internal_linking_audit.details}`
      : '',
    '</audit_report>',
  ];

  if (context?.keyword) {
    sections.push('', `Primary keyword: "${context.keyword}" — must appear in H1 and opening paragraph.`);
  }
  if (context?.seoScore !== undefined) {
    sections.push(`Current SEO score: ${context.seoScore}/100. Target: 80+.`);
  }
  if (context?.seoIssues?.length) {
    sections.push('', 'SEO issues to fix:', ...context.seoIssues.map((i) => `  - ${i}`));
  }

  return sections.filter(Boolean).join('\n');
}

@Injectable()
export class GeminiAuditService {
  private readonly logger = new Logger(GeminiAuditService.name);

  /**
   * Audits draft content and applies up to two fix passes when issues are found.
   * Returns the best final markdown for pipeline and manual endpoints.
   *
   * Routing: YMYL_AUDIT_PROVIDER=conduit (default) → Conduit chat completions.
   *          YMYL_AUDIT_PROVIDER=google → Gemini 2.5 Pro with Google Search Grounding.
   */
  async auditAndImproveContent(
    draftContent: string,
    context?: AuditFixContext,
  ): Promise<AuditAndFixResult> {
    const provider = resolveAuditProvider();
    this.logger.log({ msg: 'ymyl_audit_start', provider });

    if (provider === 'conduit') {
      return this.auditAndImproveViaConduit(draftContent, context);
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
    if (!apiKey) {
      const auditResult = failSafeAudit(
        'Audit failed due to system error: GOOGLE_AI_API_KEY is not configured',
      );
      return {
        auditResult,
        finalContent: draftContent,
        contentChanged: false,
        fixAttempts: 0,
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    let currentContent = draftContent;
    let fixAttempts = 0;
    let auditResult = await this.runAuditPhase(ai, currentContent);
    let bestAuditResult = auditResult;
    const initiallyApproved =
      auditResult.approved && auditResult.critical_errors.trim().length === 0;

    while (needsFix(auditResult) && fixAttempts < MAX_FIX_ATTEMPTS) {
      this.logger.log({
        msg: 'gemini_audit_fix_pass_started',
        fixAttempt: fixAttempts + 1,
        approved: auditResult.approved,
      });

      const fixed = await this.runFixPhase(ai, currentContent, auditResult, context);
      if (fixed?.trim()) {
        currentContent = cleanMarkdownOutput(fixed);
      } else {
        this.logger.warn({ msg: 'gemini_audit_fix_pass_empty_output', fixAttempt: fixAttempts + 1 });
      }

      fixAttempts += 1;
      auditResult = await this.runAuditPhase(ai, currentContent);
      if (auditQualityScore(auditResult) >= auditQualityScore(bestAuditResult)) {
        bestAuditResult = auditResult;
      }
    }

    if (
      !auditResult.approved &&
      auditResult.critical_errors.trim().length === 0 &&
      bestAuditResult.approved
    ) {
      this.logger.warn({
        msg: 'gemini_audit_reverted_to_best_pass',
        fixAttempts,
        finalEeat: auditResult.eeat_score,
        bestEeat: bestAuditResult.eeat_score,
      });
      auditResult = bestAuditResult;
    }

    auditResult = finalizeAuditResult(auditResult);

    if (!auditResult.approved) {
      this.logger.warn({
        msg: 'gemini_audit_not_approved_after_fixes',
        fixAttempts,
        eeat_score: auditResult.eeat_score,
        critical_errors: auditResult.critical_errors.slice(0, 500),
      });
    }

    if (initiallyApproved && !auditResult.approved && auditResult.critical_errors.trim().length === 0) {
      auditResult = { ...bestAuditResult, approved: true };
      this.logger.log({
        msg: 'gemini_audit_kept_initial_approval',
        fixAttempts,
        eeat_score: auditResult.eeat_score,
      });
    }

    return {
      auditResult,
      finalContent: currentContent,
      contentChanged: currentContent !== draftContent,
      fixAttempts,
      initiallyApproved,
    };
  }

  /** Backward-compatible audit-only wrapper. */
  async auditContent(draftContent: string): Promise<AuditResult> {
    const result = await this.auditAndImproveContent(draftContent);
    return result.auditResult;
  }

  private async runAuditPhase(ai: GoogleGenAI, content: string): Promise<AuditResult> {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), AUDIT_TIMEOUT_MS);

    try {
      // googleSearch + structured responseMimeType is unsupported by the Gemini API.
      const response = await ai.models.generateContent({
        model: AUDIT_MODEL,
        contents:
          'Please audit the following draft article. Respond with one JSON object only ' +
          '(keys: approved, eeat_score, critical_errors, seo_and_ux_recommendations, internal_linking_audit).\n\n' +
          `<draft_content>\n${content}\n</draft_content>`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
          responseMimeType: 'text/plain',
          abortSignal: abortController.signal,
          maxOutputTokens: 4096,
          temperature: 0.2,
        },
      });

      this.logGroundingMetadata(response.candidates?.[0]?.groundingMetadata, 'audit');

      const text = response.text;
      if (!text?.trim()) {
        return failSafeAudit(
          'Audit failed due to system error: Empty response received from the Gemini API.',
        );
      }

      return normalizeAuditResult(parseAuditJsonFromText(text));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'gemini_audit_phase_failed', error: message });
      return failSafeAudit(`Audit failed due to system error: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async runFixPhase(
    ai: GoogleGenAI,
    content: string,
    auditResult: AuditResult,
    context?: AuditFixContext,
  ): Promise<string | null> {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), FIX_TIMEOUT_MS);

    try {
      const response = await ai.models.generateContent({
        model: AUDIT_MODEL,
        contents: buildFixPrompt(content, auditResult, context),
        config: {
          systemInstruction: FIX_SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
          responseMimeType: 'text/plain',
          abortSignal: abortController.signal,
          maxOutputTokens: 8192,
          temperature: 0.3,
        },
      });

      this.logGroundingMetadata(response.candidates?.[0]?.groundingMetadata, 'fix');

      const text = response.text?.trim();
      return text && text.length > 0 ? text : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'gemini_audit_fix_phase_failed', error: message });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private logGroundingMetadata(
    metadata: { webSearchQueries?: string[]; groundingChunks?: { web?: { uri?: string } }[] } | undefined,
    phase: string,
  ): void {
    if (metadata?.webSearchQueries?.length) {
      this.logger.log({
        msg: 'gemini_audit_search_queries',
        phase,
        queries: metadata.webSearchQueries,
      });
    }
    if (metadata?.groundingChunks?.length) {
      const sources = metadata.groundingChunks
        .map((chunk) => chunk.web?.uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
      if (sources.length > 0) {
        this.logger.log({ msg: 'gemini_audit_grounding_sources', phase, sources });
      }
    }
  }

  // ─── Conduit path ──────────────────────────────────────────────────────────

  private async auditAndImproveViaConduit(
    draftContent: string,
    context?: AuditFixContext,
  ): Promise<AuditAndFixResult> {
    const conduitKey = process.env.CONDUIT_API_KEY?.trim();
    if (!conduitKey) {
      const auditResult = failSafeAudit(
        'Audit failed due to system error: CONDUIT_API_KEY is not configured',
      );
      return { auditResult, finalContent: draftContent, contentChanged: false, fixAttempts: 0 };
    }

    let currentContent = draftContent;
    let fixAttempts = 0;
    let auditResult = await this.runConduitAuditPhase(conduitKey, currentContent);
    let bestAuditResult = auditResult;
    const initiallyApproved =
      auditResult.approved && auditResult.critical_errors.trim().length === 0;

    while (needsFix(auditResult) && fixAttempts < MAX_FIX_ATTEMPTS) {
      this.logger.log({
        msg: 'conduit_audit_fix_pass_started',
        fixAttempt: fixAttempts + 1,
        approved: auditResult.approved,
      });

      const fixed = await this.runConduitFixPhase(conduitKey, currentContent, auditResult, context);
      if (fixed?.trim()) {
        currentContent = cleanMarkdownOutput(fixed);
      } else {
        this.logger.warn({ msg: 'conduit_audit_fix_pass_empty_output', fixAttempt: fixAttempts + 1 });
      }

      fixAttempts += 1;
      auditResult = await this.runConduitAuditPhase(conduitKey, currentContent);
      if (auditQualityScore(auditResult) >= auditQualityScore(bestAuditResult)) {
        bestAuditResult = auditResult;
      }
    }

    if (
      !auditResult.approved &&
      auditResult.critical_errors.trim().length === 0 &&
      bestAuditResult.approved
    ) {
      auditResult = bestAuditResult;
    }

    auditResult = finalizeAuditResult(auditResult);

    if (initiallyApproved && !auditResult.approved && auditResult.critical_errors.trim().length === 0) {
      auditResult = { ...bestAuditResult, approved: true };
    }

    return {
      auditResult,
      finalContent: currentContent,
      contentChanged: currentContent !== draftContent,
      fixAttempts,
      initiallyApproved,
    };
  }

  private async runConduitAuditPhase(apiKey: string, content: string): Promise<AuditResult> {
    const model =
      (process.env.CONDUIT_AUDIT_MODEL ?? 'claude-opus-4-5').trim();
    const baseUrl =
      (process.env.CONDUIT_BASE_URL ?? 'https://conduit.ozdoev.net/api/v1').trim();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUDIT_TIMEOUT_MS);

    // Truncate very long articles to avoid hitting token limits (keep ~12k chars)
    const MAX_CONTENT_CHARS = 12_000;
    const truncatedContent =
      content.length > MAX_CONTENT_CHARS
        ? content.slice(0, MAX_CONTENT_CHARS) + '\n\n[...content truncated for audit...]'
        : content;

    const requestBody: Record<string, unknown> = {
      model,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        {
          role: 'user',
          content:
            'Please audit the following draft article. Respond with one JSON object only ' +
            '(keys: approved, eeat_score, critical_errors, seo_and_ux_recommendations, internal_linking_audit).\n\n' +
            `<draft_content>\n${truncatedContent}\n</draft_content>`,
        },
      ],
    };

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // If the model doesn't support response_format, retry without it
        if (res.status === 400 && body.includes('response_format')) {
          return this.runConduitAuditPhaseRaw(apiKey, truncatedContent, model, baseUrl);
        }
        throw new Error(`Conduit HTTP ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';

      if (!text) {
        return failSafeAudit('Audit failed: empty response from Conduit');
      }

      this.logger.log({ msg: 'conduit_audit_phase_complete', model, chars: text.length });
      return normalizeAuditResult(parseAuditJsonFromText(text));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'conduit_audit_phase_failed', error: message });
      return failSafeAudit(`Audit failed due to system error: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fallback audit without response_format (for models that don't support it). */
  private async runConduitAuditPhaseRaw(
    apiKey: string,
    content: string,
    model: string,
    baseUrl: string,
  ): Promise<AuditResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUDIT_TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.CONDUIT_API_KEY?.trim() ?? ''}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            {
              role: 'user',
              content:
                'Please audit the following draft article. Respond with one JSON object only ' +
                '(keys: approved, eeat_score, critical_errors, seo_and_ux_recommendations, internal_linking_audit).\n\n' +
                `<draft_content>\n${content}\n</draft_content>`,
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Conduit HTTP ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';

      if (!text) {
        return failSafeAudit('Audit failed: empty response from Conduit');
      }

      this.logger.log({ msg: 'conduit_audit_raw_phase_complete', model, chars: text.length });
      return normalizeAuditResult(parseAuditJsonFromText(text));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'conduit_audit_raw_phase_failed', error: message, rawResponse: message.slice(0, 500) });
      return failSafeAudit(`Audit failed due to system error: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async runConduitFixPhase(
    apiKey: string,
    content: string,
    auditResult: AuditResult,
    context?: AuditFixContext,
  ): Promise<string | null> {
    const model =
      (process.env.CONDUIT_AUDIT_MODEL ?? 'claude-opus-4-5').trim();
    const baseUrl =
      (process.env.CONDUIT_BASE_URL ?? 'https://conduit.ozdoev.net/api/v1').trim();

    // Truncate very long articles to avoid hitting token limits (keep ~12k chars)
    const MAX_CONTENT_CHARS = 12_000;
    const truncatedContent =
      content.length > MAX_CONTENT_CHARS
        ? content.slice(0, MAX_CONTENT_CHARS) + '\n\n[...content truncated for fix...]'
        : content;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FIX_TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 8192,
          messages: [
            { role: 'system', content: FIX_SYSTEM_INSTRUCTION },
            { role: 'user', content: buildFixPrompt(truncatedContent, auditResult, context) },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Conduit HTTP ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';

      this.logger.log({ msg: 'conduit_fix_phase_complete', model, chars: text.length });
      return text || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'conduit_fix_phase_failed', error: message });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
