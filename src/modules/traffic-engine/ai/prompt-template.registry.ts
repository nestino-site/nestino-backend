import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';

export interface PromptBuildInput {
  stepKey: string;
  siteName: string;
  domain: string;
  keyword: string;
  language: string;
  briefJson?: Record<string, unknown>;
  draftText?: string;
  analyzeJson?: Record<string, unknown>;
}

export interface BuiltPrompt {
  system?: string;
  user: string;
}

@Injectable()
export class PromptTemplateRegistry {
  build(templateId: string, input: PromptBuildInput): BuiltPrompt {
    switch (templateId) {
      case 'outline_v1':
        return {
          system:
            'You output ONLY valid JSON. No markdown. Schema: {title:string,h2s:string[],faq:{q:string,a:string}[]}. The prepended system policy defines Villa Silyan (Antalya) brand and outline goals — align title/H2/FAQ with that.',
          user: `Site: ${input.siteName} (${input.domain}). Language: ${input.language}. Primary keyword: ${input.keyword}. Produce an SEO outline JSON with 6-9 H2 headings and 4 FAQs. Emphasize private villa value vs. hotels, Antalya-specific section themes, and book-direct–style FAQ angles where appropriate.`,
        };
      case 'draft_v1':
        return {
          system:
            'You are a luxury travel SEO writer for Villa Silyan (Antalya). Return clean Markdown only. Do NOT use escaped \\n — use real line breaks. Follow the master Villa Silyan system policy prepended in composed prompts. Anticliché, second person, E-E-A-T, local Antalya anchors.',
          user: `Write a complete, publication-ready article in ${input.language} for primary keyword "${input.keyword}".
Site: ${input.siteName} (${input.domain}).

Use this outline as structure guidance: ${JSON.stringify(input.briefJson ?? {})}

Requirements (with master policy):
- First line: one H1 using "# " (single hash). At least two H2 sections with "## ".
- 900-1400 words; Markdown. Include a compact comparison table (villa vs. hotel) when it supports conversion.
- Quantified or hedged detail, guest-voice line, one fair limitation, local anchor(s) in Antalya / Turkish Riviera context.
- Weave primary keyword in the opening and headings naturally. End with a strong book-direct CTA for ${input.domain}
- No JSON wrapper; raw markdown only`,
        };
      case 'analyze_v1':
        return {
          system:
            'Return a single JSON object exactly as specified in the prepended analysis schema message. No markdown, no commentary.',
          user: `Analyze this travel/hotel draft for SEO, readability, and E-E-A-T-style dimensions.\n---\n${input.draftText ?? ''}`,
        };
      case 'optimize_v1':
        return {
          system:
            'Output clean Markdown only (real line breaks, no escaped "\\n", no HTML wrapper, no JSON). Follow the prepended rewrite policy: flow and readability only; preserve all facts and experience signals.',
          user: `Improve readability and flow only. Do not add new facts, numbers, or places. Do not remove numeric anchors, limitations, local anchors, or guest-style observations already in the draft.

Issues (optional, wording only): ${JSON.stringify(input.analyzeJson?.issues ?? [])}

---

${input.draftText ?? ''}`,
        };
      case 'image_generation_v1':
        return {
          system:
            'Return exactly one image-generation prompt string suitable for Imagen. No markdown, no JSON.',
          user: `Create one photorealistic hero image prompt for keyword "${input.keyword}" for site ${input.siteName} (${input.domain}).
Use the article context below and optimize for travel editorial quality:
${input.draftText ?? ''}`,
        };
      case 'seo_check_v1':
        return {
          system:
            'Return strict JSON only with keys: passed (boolean), score (number), issues (string[]), googleChecklist (object).',
          user: `Review this final article for SEO quality and Google helpful content compliance.\n---\n${input.draftText ?? ''}`,
        };
      default:
        throw new NotFoundException(`Unknown promptTemplateId: ${templateId}`);
    }
  }
}
