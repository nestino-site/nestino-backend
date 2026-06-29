import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';

/**
 * Central, env-driven routing config for all AI actions.
 *
 * --- Default routing ---
 * All actions default to Conduit (AI_GATEWAY_PROVIDER=conduit).
 * Set AI_GATEWAY_PROVIDER to any provider name to change the default.
 *
 * --- Per-action overrides ---
 * Set AI_PROVIDER_<ACTION> to override a single action, e.g.:
 *   AI_PROVIDER_GENERATE=openai
 *   AI_PROVIDER_SEO_CHECK=anthropic
 *
 * Supported action keys: generate, analyze, rewrite, seo_check, linking, enrich, ideas
 *
 * --- Fallback order ---
 * AI_FALLBACK_ORDER is a comma-separated list of provider names used when a
 * provider fails transiently. Default: conduit,openai,anthropic,google
 *
 * --- Fallback models ---
 * When falling back, these env vars supply the model to use:
 *   AI_FALLBACK_CONDUIT_MODEL    (default: gpt-4o-mini)
 *   AI_FALLBACK_OPENAI_MODEL     (default: gpt-4o-mini)
 *   AI_FALLBACK_ANTHROPIC_MODEL  (default: claude-3-5-haiku-20241022)
 *   AI_FALLBACK_GOOGLE_MODEL     (default: gemini-1.5-flash)
 */

export type AiAction =
  | 'generate'
  | 'analyze'
  | 'rewrite'
  | 'seo_check'
  | 'linking'
  | 'enrich'
  | 'ideas';

const PROVIDER_NAMES: Record<string, AiProvider> = {
  openai: AiProvider.openai,
  anthropic: AiProvider.anthropic,
  google: AiProvider.google,
  conduit: AiProvider.conduit,
};

const DEFAULT_FALLBACK_ORDER: AiProvider[] = [
  AiProvider.conduit,
  AiProvider.openai,
  AiProvider.anthropic,
  AiProvider.google,
];

const FALLBACK_MODEL: Record<AiProvider, () => string> = {
  [AiProvider.conduit]: () => process.env.AI_FALLBACK_CONDUIT_MODEL ?? 'gpt-4o-mini',
  [AiProvider.openai]: () => process.env.AI_FALLBACK_OPENAI_MODEL ?? 'gpt-4o-mini',
  [AiProvider.anthropic]: () =>
    process.env.AI_FALLBACK_ANTHROPIC_MODEL ?? 'claude-3-5-haiku-20241022',
  [AiProvider.google]: () => process.env.AI_FALLBACK_GOOGLE_MODEL ?? 'gemini-1.5-flash',
};

function parseProvider(raw: string | undefined, fallback: AiProvider): AiProvider {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  return PROVIDER_NAMES[normalized] ?? fallback;
}

@Injectable()
export class AiGatewayConfig {
  /**
   * Returns the provider to use for a given action.
   * Priority: AI_PROVIDER_<ACTION> > AI_GATEWAY_PROVIDER > conduit
   */
  resolveProvider(action: AiAction): AiProvider {
    const globalDefault = parseProvider(
      process.env.AI_GATEWAY_PROVIDER,
      AiProvider.conduit,
    );
    const actionKey = `AI_PROVIDER_${action.toUpperCase().replace('-', '_')}`;
    return parseProvider(process.env[actionKey], globalDefault);
  }

  /**
   * Returns the ordered fallback chain after `currentProvider` fails.
   * Walks AI_FALLBACK_ORDER and returns the next provider in the list.
   */
  nextFallback(currentProvider: AiProvider): { provider: AiProvider; model: string } | null {
    const order = this.fallbackOrder();
    const idx = order.indexOf(currentProvider);
    if (idx < 0 || idx >= order.length - 1) {
      return null;
    }
    const next = order[idx + 1];
    return { provider: next, model: FALLBACK_MODEL[next]() };
  }

  /** Full fallback chain parsed from AI_FALLBACK_ORDER. */
  fallbackOrder(): AiProvider[] {
    const raw = process.env.AI_FALLBACK_ORDER;
    if (!raw) return DEFAULT_FALLBACK_ORDER;
    const parsed = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s in PROVIDER_NAMES)
      .map((s) => PROVIDER_NAMES[s]!);
    return parsed.length > 0 ? parsed : DEFAULT_FALLBACK_ORDER;
  }
}
