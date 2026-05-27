import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import type { AuditResult, InternalLinkingAuditStatus } from '../dto/audit-content.dto';

const AUDIT_MODEL = 'gemini-2.5-pro';
const AUDIT_TIMEOUT_MS = 120_000;

const SYSTEM_INSTRUCTION = `You are an elite YMYL Medical SEO Auditor and Expert Fact-Checker.
Your primary job is to audit medical tourism content (specifically IVF, fertility treatments, and destination-specific laws) for absolute accuracy and E-E-A-T compliance.

CRITICAL RULES:
1. Always use Google Search Grounding to verify all legal and medical claims.
2. Verify strict regional regulations. For example, in Turkey (IVF is restricted ONLY to legally married heterosexual couples using their own genetic materials. Donor eggs/sperm/embryos, surrogacy, treatment for single women/lesbian couples, and gender selection for social reasons are strictly illegal).
3. Check currency/costs against 2026 market standards (Turkey IVF is typically $2,500-$5,000 USD basic cost, medications $800-$1,200).
4. Identify "lazy templating" leaks (e.g., links pointing to Spain guides inside a Turkey IVF guide).
5. Output MUST strictly match the provided JSON schema. No conversational wrappers.`;

const AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    approved: {
      type: Type.BOOLEAN,
      description:
        'Must be false if there is ANY critical factual/legal error (e.g., Turkey IVF married laws, donor bans, template leaks).',
    },
    eeat_score: {
      type: Type.INTEGER,
      description: 'A rating from 1 to 10 based on medical accuracy and trustworthiness.',
    },
    critical_errors: {
      type: Type.STRING,
      description: 'Detailed list of any legal, medical, or template errors found.',
    },
    seo_and_ux_recommendations: {
      type: Type.STRING,
      description: 'Recommendations for tables, formatting, and structural improvements.',
    },
    internal_linking_audit: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          enum: ['approved', 'needs_fix'],
        },
        details: {
          type: Type.STRING,
          description:
            'Flags contextually irrelevant internal links (e.g., Spanish clinic references in a Turkey guide).',
        },
      },
      required: ['status', 'details'],
    },
  },
  required: [
    'approved',
    'eeat_score',
    'critical_errors',
    'seo_and_ux_recommendations',
    'internal_linking_audit',
  ],
} as const;

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
  };
}

function normalizeAuditResult(raw: unknown): AuditResult {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const linking =
    obj.internal_linking_audit && typeof obj.internal_linking_audit === 'object'
      ? (obj.internal_linking_audit as Record<string, unknown>)
      : {};
  const statusRaw = linking.status;
  const status: InternalLinkingAuditStatus =
    statusRaw === 'approved' ? 'approved' : 'needs_fix';
  const eeatRaw = typeof obj.eeat_score === 'number' ? obj.eeat_score : 1;
  const eeat_score = Math.max(1, Math.min(10, Math.round(eeatRaw)));

  return {
    approved: obj.approved === true,
    eeat_score,
    critical_errors:
      typeof obj.critical_errors === 'string' ? obj.critical_errors : String(obj.critical_errors ?? ''),
    seo_and_ux_recommendations:
      typeof obj.seo_and_ux_recommendations === 'string'
        ? obj.seo_and_ux_recommendations
        : String(obj.seo_and_ux_recommendations ?? ''),
    internal_linking_audit: {
      status,
      details: typeof linking.details === 'string' ? linking.details : String(linking.details ?? ''),
    },
  };
}

@Injectable()
export class GeminiAuditService {
  private readonly logger = new Logger(GeminiAuditService.name);

  /**
   * Audits draft content with Gemini 2.5 Pro, Google Search Grounding, and structured JSON output.
   */
  async auditContent(draftContent: string): Promise<AuditResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return failSafeAudit('Audit failed due to system error: GEMINI_API_KEY is not configured');
    }

    const ai = new GoogleGenAI({ apiKey });
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), AUDIT_TIMEOUT_MS);

    try {
      const response = await ai.models.generateContent({
        model: AUDIT_MODEL,
        contents: `Please audit the following draft article:\n\n<draft_content>\n${draftContent}\n</draft_content>`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: AUDIT_RESPONSE_SCHEMA,
          abortSignal: abortController.signal,
          maxOutputTokens: 4096,
          temperature: 0.2,
        },
      });

      const metadata = response.candidates?.[0]?.groundingMetadata;
      if (metadata?.webSearchQueries?.length) {
        this.logger.log({
          msg: 'gemini_audit_search_queries',
          queries: metadata.webSearchQueries,
        });
      }
      if (metadata?.groundingChunks?.length) {
        const sources = metadata.groundingChunks
          .map((chunk) => chunk.web?.uri)
          .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
        if (sources.length > 0) {
          this.logger.log({ msg: 'gemini_audit_grounding_sources', sources });
        }
      }

      const text = response.text;
      if (!text?.trim()) {
        return failSafeAudit('Audit failed due to system error: Empty response received from the Gemini API.');
      }

      const parsed = JSON.parse(text) as unknown;
      return normalizeAuditResult(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'gemini_audit_failed', error: message });
      return failSafeAudit(`Audit failed due to system error: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
