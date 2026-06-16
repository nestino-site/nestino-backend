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

/** Flatten knowledge-base facts to a compact bullet list (max ~1.5 KB). */
function compactKnowledgeFacts(kb: unknown): string[] {
  if (!kb || typeof kb !== 'object' || Array.isArray(kb)) return [];
  const bullets: string[] = [];
  for (const [k, v] of Object.entries(kb as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 4)) {
        bullets.push(`${k}: ${String(item)}`);
      }
    } else if (v !== null && v !== undefined) {
      bullets.push(`${k}: ${String(v)}`);
    }
    if (bullets.length >= 15) break;
  }
  return bullets;
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
    if (typeof raw.geoConstraint === 'string' && raw.geoConstraint.trim()) {
      base.geoConstraint = raw.geoConstraint.trim();
    }
    if (typeof raw.pageTitle === 'string' && raw.pageTitle.trim()) {
      base.pageTitle = raw.pageTitle.trim();
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

    // --- SEO brief context (critical for impression-driving content) ---
    if (raw.intent && typeof raw.intent === 'string') {
      base.intent = raw.intent;
    }
    if (raw.topic && typeof raw.topic === 'string' && raw.topic.trim()) {
      base.topic = raw.topic.trim();
    }
    if (typeof raw.targetWordCount === 'number') {
      base.targetWordCount = raw.targetWordCount;
    }
    if (Array.isArray(raw.requiredSections) && raw.requiredSections.length > 0) {
      base.requiredSections = (raw.requiredSections as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 10);
    }
    if (Array.isArray(raw.secondaryKeywords) && raw.secondaryKeywords.length > 0) {
      base.secondaryKeywords = (raw.secondaryKeywords as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 8);
    }
    if (Array.isArray(raw.semanticTopics) && raw.semanticTopics.length > 0) {
      base.semanticTopics = (raw.semanticTopics as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 10);
    }
    if (Array.isArray(raw.paaQuestions) && raw.paaQuestions.length > 0) {
      base.paaQuestions = (raw.paaQuestions as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 6);
    }

    // Competitor heading hints (titles only to save tokens)
    const seoBrief = raw.seoBrief as Record<string, unknown> | undefined;
    if (seoBrief && Array.isArray(seoBrief.competitorOutlineHints) && seoBrief.competitorOutlineHints.length > 0) {
      base.competitorHeadings = (seoBrief.competitorOutlineHints as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 8);
    }

    // Internal link targets (brief slug+anchor hints so model can reference them)
    if (Array.isArray(raw.internalLinkTargets) && raw.internalLinkTargets.length > 0) {
      base.internalLinkTargets = (raw.internalLinkTargets as Array<Record<string, unknown>>)
        .slice(0, 5)
        .map((t) => ({ slug: t.slug, keyword: t.keyword }));
    }

    // Knowledge base facts (grounding; prevents hallucination)
    if (raw.knowledgeBase) {
      const facts = compactKnowledgeFacts(raw.knowledgeBase);
      if (facts.length > 0) {
        base.knowledgeFacts = facts;
      }
    } else if (seoBrief?.knowledgeFacts) {
      const facts = compactKnowledgeFacts(seoBrief.knowledgeFacts);
      if (facts.length > 0) {
        base.knowledgeFacts = facts;
      }
    }

    // SERP entities from SerpSnapshot if available
    if (Array.isArray(raw.serpEntities) && raw.serpEntities.length > 0) {
      base.serpEntities = (raw.serpEntities as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 8);
    }

    // Template formatting constraints
    if (typeof raw.templateFormattingInstructions === 'string' && raw.templateFormattingInstructions.trim()) {
      base.formattingInstructions = raw.templateFormattingInstructions.trim().slice(0, 400);
    }
    if (Array.isArray(raw.templateSeoRules) && raw.templateSeoRules.length > 0) {
      base.seoRules = (raw.templateSeoRules as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 6);
    }
    if (typeof raw.templateInternalLinkingRules === 'string' && raw.templateInternalLinkingRules.trim()) {
      base.internalLinkingRules = raw.templateInternalLinkingRules.trim().slice(0, 200);
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
