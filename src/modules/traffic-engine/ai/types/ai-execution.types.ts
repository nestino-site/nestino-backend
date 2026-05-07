import { KeywordIntent } from '@prisma/client';

export type PipelineStep =
  | 'generate'
  | 'analyze'
  | 'rewrite'
  | 'image_generation'
  | 'seo_check';

export type HumanizationLevel = 'low' | 'medium' | 'high';

export type BudgetAction = 'downgrade_model' | 'skip_analysis' | 'reduce_tokens' | null;

export interface ModelResolutionContext {
  step: PipelineStep;
  intent: KeywordIntent;
  priority: number;
  siteId: string;
  budgetAction: BudgetAction;
}

export interface PromptCompositionContext {
  type: PipelineStep;
  siteId: string;
  version: string;
  tone: string;
  locale: string;
  /** After site-config normalization, always set. */
  humanizationEnabled: boolean;
  humanizationLevel: HumanizationLevel;
  runtimeContext: Record<string, unknown>;
  abVariant?: 'A' | 'B';
}
