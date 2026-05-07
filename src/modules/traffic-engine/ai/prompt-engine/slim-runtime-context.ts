import { PipelineStep } from '../types/ai-execution.types';

function compactOutline(brief: Record<string, unknown>): Record<string, unknown> {
  const title = typeof brief.title === 'string' ? brief.title : undefined;
  const h2sRaw = brief.h2s;
  const h2s = Array.isArray(h2sRaw)
    ? (h2sRaw as unknown[])
        .filter((x): x is string => typeof x === 'string')
        .slice(0, 15)
    : [];
  const faq = brief.faq;
  return {
    ...(title ? { title } : {}),
    h2s,
    ...(Array.isArray(faq) && faq.length > 0 ? { faq: (faq as unknown[]).slice(0, 6) } : {}),
  };
}

/**
 * Compact payload embedded in the user message (not full pipeline context).
 * Full `runtimeContext` is still kept on the composition context for fallbacks.
 */
export function slimRuntimeContextForPrompt(
  step: PipelineStep,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const keyword = String(raw.keyword ?? '');
  const language = String(raw.language ?? 'en');

  if (step === 'generate') {
    const mode = raw.mode === 'outline' ? 'outline' : 'draft';
    const base: Record<string, unknown> = {
      keyword,
      language,
      mode,
      siteName: raw.siteName,
      domain: raw.domain,
    };
    if (raw.location != null && String(raw.location).trim()) {
      base.location = raw.location;
    }
    if (Array.isArray(raw.core_benefits) && raw.core_benefits.length > 0) {
      base.core_benefits = (raw.core_benefits as unknown[]).filter(
        (x) => typeof x === 'string' && x.trim().length > 0,
      );
    }
    if (typeof raw.seo_instructions === 'string' && raw.seo_instructions.trim()) {
      base.seo_instructions = raw.seo_instructions.trim();
    }
    if (raw.cta_target != null && String(raw.cta_target).trim()) {
      base.cta_target = String(raw.cta_target).trim();
    }
    if (mode === 'draft' && raw.briefJson && typeof raw.briefJson === 'object') {
      base.outline = compactOutline(raw.briefJson as Record<string, unknown>);
    }
    return base;
  }

  if (step === 'analyze') {
    const outline =
      raw.briefJson && typeof raw.briefJson === 'object'
        ? compactOutline(raw.briefJson as Record<string, unknown>)
        : undefined;
    return {
      keyword,
      language,
      draftText: String(raw.draftText ?? ''),
      ...(outline && Object.keys(outline).length > 0 ? { outline } : {}),
    };
  }

  if (step === 'image_generation') {
    return {
      keyword,
      language,
      finalContent: String(raw.finalContent ?? ''),
    };
  }

  if (step === 'seo_check') {
    return {
      keyword,
      language,
      title: String(raw.title ?? ''),
      metaDescription: String(raw.metaDescription ?? ''),
      finalContent: String(raw.finalContent ?? ''),
      geoScore: raw.geoScore,
    };
  }

  // rewrite
  const analyze = raw.analyzeJson as Record<string, unknown> | undefined;
  const issues = Array.isArray(analyze?.issues)
    ? (analyze!.issues as string[]).slice(0, 50)
    : [];
  const missingKeywords = Array.isArray(analyze?.missingKeywords)
    ? (analyze!.missingKeywords as string[]).slice(0, 30)
    : [];

  const signalSummary = {
    experienceScore: typeof analyze?.experienceScore === 'number' ? analyze!.experienceScore : undefined,
    genericContentScore: typeof analyze?.genericContentScore === 'number' ? analyze!.genericContentScore : undefined,
    informationGainScore: typeof analyze?.informationGainScore === 'number' ? analyze!.informationGainScore : undefined,
    eeatSignalScore: typeof analyze?.eeatSignalScore === 'number' ? analyze!.eeatSignalScore : undefined,
  };

  return {
    keyword,
    language,
    draftText: String(raw.draftText ?? ''),
    issues,
    missingKeywords,
    eeatSignals: signalSummary,
  };
}
