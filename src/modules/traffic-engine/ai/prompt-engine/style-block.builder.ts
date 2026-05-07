import { HumanizationLevel, PipelineStep } from '../types/ai-execution.types';

export interface StyleBlockConfig {
  tone: string;
  humanizationLevel: HumanizationLevel;
  humanizationEnabled: boolean;
  locale: string;
  step: PipelineStep;
}

/** Short addendum — detailed travel / anti-AI rules live in travel-content-writer.prompt.ts prepended earlier in system. */
const CORE_HUMANIZATION_RULES = `Humanization addendum (align with the travel content policy block above when present):
- Keep sentence length varied; avoid parallel “AI list” rhythm across sections.
- Natural transitions; scannable paragraphs; no keyword stuffing.
- Skip filler phrases ("it is important to note", "in today's world", "delve into").`;

const REWRITE_HUMANIZATION_BOOST = `Rewrite pass — scope:
- Flow, rhythm, transitions, clarity only. Preserve every fact and experience signal from the draft.
- No new numbers, places, or claims. Markdown only (no JSON/HTML shell).`;

const TONE_LINES: Record<string, string> = {
  seo: 'Tone profile: SEO-focused — clear headings, helpful depth, search intent satisfied without gimmicks.',
  conversational:
    'Tone profile: Conversational — warm, direct, second person where appropriate, still authoritative.',
  formal: 'Tone profile: Formal — precise, professional vocabulary; avoid slang unless brand requires it.',
};

function toneLine(tone: string): string {
  return TONE_LINES[tone] ?? `Tone profile: ${tone}.`;
}

function levelAddendum(level: HumanizationLevel): string {
  switch (level) {
    case 'low':
      return 'Intensity: keep edits minimal; prefer subtle smoothing over wholesale rewrites.';
    case 'high':
      return 'Intensity: be assertive about variety, rhythm, and removing generic AI phrasing.';
    default:
      return 'Intensity: balance polish with fidelity to the source brief and facts.';
  }
}

/**
 * Injected system block: locale, tone personality, humanization depth.
 * Core humanization rules are always appended (system controls quality).
 */
export function buildStyleBlock(config: StyleBlockConfig): string {
  const lines = [
    'Writing Style Rules',
    '---',
    toneLine(config.tone),
    `Language / locale: ${config.locale}.`,
    levelAddendum(config.humanizationLevel),
    '---',
    CORE_HUMANIZATION_RULES,
  ];

  if (config.step === 'rewrite') {
    lines.push('---', REWRITE_HUMANIZATION_BOOST);
  }

  if (config.step === 'analyze') {
    lines.push(
      '---',
      'Analysis step: output must follow the JSON schema given in the user message. Keep issue strings concrete and actionable.',
    );
  }

  if (!config.humanizationEnabled) {
    lines.push(
      '---',
      'Humanization extras: keep personality light; prioritize accuracy and schema compliance.',
    );
  }

  return lines.join('\n');
}
