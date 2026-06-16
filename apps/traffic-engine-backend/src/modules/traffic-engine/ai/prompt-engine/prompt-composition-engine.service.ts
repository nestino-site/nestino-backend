import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { RedisService } from '../../../../common/redis/redis.service';
import { SiteConfigService } from '../../config/site-config.service';
import { BuiltPrompt, PromptTemplateRegistry } from '../prompt-template.registry';
import { PromptCompositionContext } from '../types/ai-execution.types';
import { slimRuntimeContextForPrompt } from './slim-runtime-context';
import { buildStyleBlock } from './style-block.builder';
import {
  TRAVEL_ANALYSIS_JSON_HINT,
  TRAVEL_CONTENT_POLICY_SYSTEM,
  TRAVEL_OUTLINE_JSON_HINT,
  TRAVEL_REWRITE_EDITOR_SYSTEM,
} from './travel-content-writer.prompt';
import { VILLA_SILYAN_DRAFT_LAYER, VILLA_SILYAN_OUTLINE_LAYER } from './villa-silyan-master.prompt';

const PROMPT_CACHE_TTL_SECONDS = 600;
const IMAGE_GENERATION_SYSTEM_HINT =
  'You are an expert at writing photorealistic image generation prompts. Read the article context and return ONE optimized Imagen prompt only. No markdown, no JSON, no commentary. Do not include text, logos, watermarks, or identifiable faces in the image. Focus on location cues, mood, lighting, composition, camera style, and visual realism.';
const SEO_CHECK_SYSTEM_HINT =
  'You are a Google SEO specialist. Evaluate content against Helpful Content guidelines, E-E-A-T signals, technical on-page SEO readiness, heading structure, and structured data alignment. Return only strict JSON with keys: passed (boolean), score (0-100 number), issues (string[]), googleChecklist (object).';

@Injectable()
export class PromptCompositionEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly siteConfigService: SiteConfigService,
    private readonly fallbackRegistry: PromptTemplateRegistry,
  ) {}

  async compose(
    context: PromptCompositionContext,
    options?: { skipCache?: boolean },
  ): Promise<BuiltPrompt> {
    const cacheKey = this.getCacheKey(context);
    if (!options?.skipCache) {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as BuiltPrompt;
      }
    }

    const [siteTemplate, globalTemplate] = await Promise.all([
      this.prisma.promptTemplate.findFirst({
        where: {
          siteId: context.siteId,
          type: context.type,
          version: context.version,
          abVariant: context.abVariant ?? null,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promptTemplate.findFirst({
        where: {
          siteId: null,
          type: context.type,
          version: context.version,
          abVariant: context.abVariant ?? null,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const merged = this.mergeTemplate(
      globalTemplate?.system ?? undefined,
      globalTemplate?.user ?? undefined,
      siteTemplate?.system ?? undefined,
      siteTemplate?.user ?? undefined,
      context,
    );

    if (!options?.skipCache) {
      await this.redis.client.setex(cacheKey, PROMPT_CACHE_TTL_SECONDS, JSON.stringify(merged));
    }
    return merged;
  }

  async resolveVariant(siteId: number, pageId: number): Promise<'A' | 'B' | undefined> {
    const siteCfg = await this.siteConfigService.getForSite(siteId);
    if (!siteCfg.promptConfig.abTestingEnabled) {
      return undefined;
    }
    const hash = String(pageId)
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return hash % 2 === 0 ? 'A' : 'B';
  }

  private mergeTemplate(
    globalSystem: string | undefined,
    globalUser: string | undefined,
    siteSystem: string | undefined,
    siteUser: string | undefined,
    context: PromptCompositionContext,
  ): BuiltPrompt {
    const styleBlock = buildStyleBlock({
      tone: context.tone,
      humanizationLevel: context.humanizationLevel,
      humanizationEnabled: context.humanizationEnabled,
      locale: context.locale,
      step: context.type,
    });

    const travelLayer = this.travelPolicyLayer(context);
    const systemParts = [travelLayer, globalSystem, siteSystem, styleBlock].map((s) => (s ?? '').trim()).filter(Boolean);
    const system = systemParts.join('\n\n').trim() || undefined;

    const slim = slimRuntimeContextForPrompt(context.type, context.runtimeContext);
    const runtimeLine = `RuntimeContext:\n${JSON.stringify(slim)}`;
    const mandatorySignals = this.draftComplianceUserBlock(context);
    const userParts = [globalUser ?? '', siteUser ?? '', runtimeLine, mandatorySignals]
      .map((s) => s.trim())
      .filter(Boolean);
    const user = userParts.join('\n\n');

    if (!user.trim()) {
      return this.fallbackPrompt(context);
    }

    return {
      system,
      user,
    };
  }

  private travelPolicyLayer(context: PromptCompositionContext): string {
    if (context.type === 'image_generation') {
      return IMAGE_GENERATION_SYSTEM_HINT;
    }
    if (context.type === 'seo_check') {
      return SEO_CHECK_SYSTEM_HINT;
    }
    if (context.type === 'analyze') {
      return TRAVEL_ANALYSIS_JSON_HINT;
    }
    if (context.type === 'rewrite') {
      return TRAVEL_REWRITE_EDITOR_SYSTEM;
    }
    if (context.type === 'generate' && context.runtimeContext.mode === 'outline') {
      const brand = this.brandLayer(context, 'outline');
      return brand ? `${TRAVEL_OUTLINE_JSON_HINT}\n\n${brand}` : TRAVEL_OUTLINE_JSON_HINT;
    }
    if (context.type === 'generate') {
      const brand = this.brandLayer(context, 'draft');
      // Wire TRAVEL_CONTENT_POLICY_SYSTEM as the system layer for all generate/draft steps
      return brand ? `${TRAVEL_CONTENT_POLICY_SYSTEM}\n\n${brand}` : TRAVEL_CONTENT_POLICY_SYSTEM;
    }
    return '';
  }

  private brandLayer(context: PromptCompositionContext, mode: 'outline' | 'draft'): string {
    const useVillaSilyan = this.isVillaSilyanSite(context);
    if (!useVillaSilyan) {
      return '';
    }
    return mode === 'outline' ? VILLA_SILYAN_OUTLINE_LAYER : VILLA_SILYAN_DRAFT_LAYER;
  }

  private isVillaSilyanSite(context: PromptCompositionContext): boolean {
    // Allowlist of site IDs takes precedence (most secure)
    const allowlistEnv = process.env.VILLA_SILYAN_SITE_IDS?.trim();
    if (allowlistEnv) {
      const allowedIds = allowlistEnv.split(',').map((s) => Number(s.trim())).filter(Boolean);
      if (allowedIds.includes(context.siteId)) return true;
    }
    // Fallback: explicit flag for backward compat
    if (process.env.ENABLE_VILLA_SILYAN_PROMPTS === 'true') return true;
    // Legacy domain heuristic (weaker — prefer site ID allowlist)
    const domain = (context.siteDomain ?? '').toLowerCase();
    return domain.includes('villasilyan');
  }

  private fallbackPrompt(context: PromptCompositionContext): BuiltPrompt {
    const templateId =
      context.type === 'generate'
        ? context.runtimeContext.mode === 'outline'
          ? 'outline_v1'
          : 'draft_v1'
        : context.type === 'analyze'
          ? 'analyze_v1'
          : context.type === 'rewrite'
            ? 'optimize_v1'
            : context.type === 'image_generation'
              ? 'image_generation_v1'
              : 'seo_check_v1';
    const built = this.fallbackRegistry.build(templateId, {
      stepKey: context.type,
      siteName: String(context.runtimeContext.siteName ?? 'Site'),
      domain: String(context.runtimeContext.domain ?? ''),
      keyword: String(context.runtimeContext.keyword ?? ''),
      language: context.locale,
      briefJson: context.runtimeContext.briefJson as Record<string, unknown> | undefined,
      draftText: context.runtimeContext.draftText as string | undefined,
      analyzeJson: context.runtimeContext.analyzeJson as Record<string, unknown> | undefined,
    });
    const travel = this.travelPolicyLayer(context);
    const system = [travel, built.system].map((s) => (s ?? '').trim()).filter(Boolean).join('\n\n').trim() || travel;
    const mandatorySignals = this.draftComplianceUserBlock(context);
    const userExtra = [`RuntimeContext:\n${JSON.stringify(slimRuntimeContextForPrompt(context.type, context.runtimeContext))}`, mandatorySignals]
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n\n');
    const user = userExtra ? `${built.user}\n\n${userExtra}` : built.user;
    return { system, user };
  }

  /** Injected into the user message so DB templates cannot drop travel policy requirements. */
  private draftComplianceUserBlock(context: PromptCompositionContext): string {
    if (context.type !== 'generate' || context.runtimeContext.mode !== 'draft') {
      return '';
    }
    const r = context.runtimeContext;

    // --- Dynamic word count from brief ---
    const targetWordCount =
      typeof r.targetWordCount === 'number' && r.targetWordCount > 0
        ? r.targetWordCount
        : 1200;
    const wordCountMin = Math.round(targetWordCount * 0.85);
    const wordCountMax = Math.round(targetWordCount * 1.15);

    // --- Required sections from brief/template ---
    const requiredSections = Array.isArray(r.requiredSections)
      ? (r.requiredSections as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 10)
      : [];
    const sectionsBlock =
      requiredSections.length > 0
        ? `\nRequired sections (cover all of them): ${requiredSections.join(' → ')}`
        : '';

    // --- Knowledge facts grounding ---
    const knowledgeFacts = Array.isArray(r.knowledgeFacts)
      ? (r.knowledgeFacts as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    const knowledgeBlock =
      knowledgeFacts.length > 0
        ? `\n\nKNOWLEDGE FACTS (use these; do not invent new facts not supported here):\n${knowledgeFacts.map((f) => `- ${f}`).join('\n')}`
        : '';

    // --- Intent-specific writing guidance ---
    const intent = typeof r.intent === 'string' ? r.intent : 'INFORMATIONAL';
    const intentGuide = this.intentWritingGuide(intent);

    // --- Entities from SERP to mention ---
    const serpEntities = Array.isArray(r.serpEntities)
      ? (r.serpEntities as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 6)
      : [];
    const entitiesBlock =
      serpEntities.length > 0
        ? `\nSERP entities to mention (naturally, not forcefully): ${serpEntities.join(', ')}`
        : '';

    // --- Secondary keywords coverage ---
    const secondaryKeywords = Array.isArray(r.secondaryKeywords)
      ? (r.secondaryKeywords as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 6)
      : [];
    const secondaryBlock =
      secondaryKeywords.length > 0
        ? `\nSecondary keywords to naturally integrate: ${secondaryKeywords.join(', ')}`
        : '';

    // --- PAA questions to address ---
    const paaQuestions = Array.isArray(r.paaQuestions)
      ? (r.paaQuestions as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 4)
      : [];
    const paaBlock =
      paaQuestions.length > 0
        ? `\nPeople Also Ask (answer at least 2 of these): ${paaQuestions.join(' | ')}`
        : '';

    // --- Template SEO rules & formatting ---
    const templateSeoRules = Array.isArray(r.seoRules)
      ? (r.seoRules as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 5)
      : [];
    const seoRulesBlock =
      templateSeoRules.length > 0
        ? `\nTemplate SEO rules (follow these): ${templateSeoRules.join('; ')}`
        : '';
    const formattingBlock =
      typeof r.formattingInstructions === 'string' && r.formattingInstructions.trim()
        ? `\nFormatting instructions: ${r.formattingInstructions.trim()}`
        : '';

    const siteExtras: string[] = [];
    if (typeof r.seo_instructions === 'string' && r.seo_instructions.trim()) {
      siteExtras.push(`**Site-specific SEO instructions (from content task):** ${r.seo_instructions.trim()}`);
    }
    if (r.cta_target != null && String(r.cta_target).trim()) {
      siteExtras.push(
        `**Primary CTA target (from content task):** ${String(r.cta_target).trim()}`,
      );
    }
    if (r.location != null && String(r.location).trim()) {
      siteExtras.push(`**Location focus:** ${String(r.location).trim()}`);
    }
    if (typeof r.geoConstraint === 'string' && r.geoConstraint.trim()) {
      siteExtras.push(`**Geographic constraint (mandatory):** ${r.geoConstraint.trim()}`);
    }
    if (Array.isArray(r.core_benefits) && r.core_benefits.length > 0) {
      const benefits = r.core_benefits
        .map((b) => String(b).trim())
        .filter(Boolean)
        .slice(0, 12);
      if (benefits.length) {
        siteExtras.push(`**Core benefits to weave in:** ${benefits.join(', ')}`);
      }
    }
    const siteExtrasBlock =
      siteExtras.length > 0 ? `\n\n${siteExtras.join('\n\n')}\n` : '';

    return `MANDATORY EXPERIENCE SIGNALS (READ THIS LAST BEFORE WRITING; verify before finishing):
1) One numeric or quantified detail (price band, minutes/walk/drive, distance, hours, floors — hedge if unsure; never fake exact figures).
2) One subjective traveler-style opinion (who it suits, vibe — not ad copy).
3) One real-world usage detail (queues, breakfast rush, Wi‑Fi/AC reality, lobby flow, etc.).
4) One small credible limitation (noise, access, peak-hour friction, or room-wing variation).
5) One local anchor (street, district, landmark, or transport hint).
6) One specific local navigation hint per named hotel/villa (checkpoint proximity, quieter side of district, practical road access cue).
7) Include at least one brief cross-hotel comparison where helpful (do not isolate each property as a disconnected brochure card).
8) If exact facts are missing (price/distance/minutes), use realistic hedged ranges tied to context; never fallback to cliches like "near attractions".

Banned phrases (do not use or close paraphrases): "vibrant culture", "rich in history", "perfect stay", "luxury experience", "hidden gem", "stunning views", "stunning", "exquisite", "captivating", "memorable".

Markdown shape (required): first title line is H1 with "# " only; at least two separate "## " H2 sections; use "###" only for subheads under an H2.
- Add scannability elements where they improve clarity: blockquotes for "Pro Tip" notes and a compact "Quick Facts" markdown table.
- Avoid repetitive "The hotel has..." phrasing; use causal linking and traveler-impact framing.
- For villas, include practical limitation logistics (road condition and/or mobile signal strength).

Length: ${wordCountMin}–${wordCountMax} words. Markdown only; real line breaks (no literal \\n character sequences).${sectionsBlock}${secondaryBlock}${paaBlock}${entitiesBlock}${seoRulesBlock}${formattingBlock}${knowledgeBlock}

${intentGuide}${siteExtrasBlock}`;
  }

  private intentWritingGuide(intent: string): string {
    switch (intent.toUpperCase()) {
      case 'TRANSACTIONAL':
        return 'INTENT: TRANSACTIONAL — Lead with what the user can do/buy/book. Include clear CTAs. State prices, offers, or booking steps early. Be concise and action-oriented. FAQ should focus on objections (cancellation, availability, payment).';
      case 'COMMERCIAL':
        return 'INTENT: COMMERCIAL INVESTIGATION — The user is comparing options. Include a comparison table or section. Cover pros/cons per option. Name competitors or alternatives explicitly. Help the user decide.';
      case 'NAVIGATIONAL':
        return 'INTENT: NAVIGATIONAL — User wants to reach a specific brand/place/page. Be concise. Front-load the answer. Include direct links or paths. Avoid padding.';
      case 'INFORMATIONAL':
      default:
        return 'INTENT: INFORMATIONAL — User wants depth and authoritative answers. Cover the topic comprehensively. Use statistics, examples, sub-topics. Structure with clear H2/H3 hierarchy for scanability. Include FAQ section addressing "people also ask" style questions.';
    }
  }

  private getCacheKey(context: PromptCompositionContext): string {
    const variant = context.abVariant ?? 'default';
    const h = `${context.humanizationEnabled ? '1' : '0'}:${context.humanizationLevel}`;
    const mode =
      context.type === 'generate' && context.runtimeContext.mode
        ? String(context.runtimeContext.mode)
        : '-';
    const ph = this.hashGenerateRuntimeSlice(context);
    return `prompt:${context.type}:${context.version}:${context.siteId}:${context.locale}:${context.tone}:${h}:${variant}:m=${mode}:p=${ph}:tw8`;
  }

  /** Distinguish outline vs draft and content-task payload so Redis cache cannot cross-contaminate. */
  private hashGenerateRuntimeSlice(context: PromptCompositionContext): string {
    if (context.type !== 'generate') {
      return '-';
    }
    const r = context.runtimeContext;
    const part = [
      r.mode,
      r.keyword,
      r.siteName,
      r.location,
      r.geoConstraint,
      JSON.stringify(r.core_benefits ?? null),
      r.seo_instructions,
      r.cta_target,
      r.intent,
      r.topic,
      String(r.targetWordCount ?? ''),
      JSON.stringify(r.requiredSections ?? null),
      JSON.stringify(r.secondaryKeywords ?? null),
    ]
      .map((x) => (x == null ? '' : String(x)))
      .join('\u001f');
    return part.trim() ? createHash('sha256').update(part).digest('hex').slice(0, 20) : '-';
  }
}
