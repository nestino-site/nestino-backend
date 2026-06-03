export interface PipelineStepParams {
  [key: string]: unknown;
}

export interface PipelineStep {
  stepKey: string;
  enabled: boolean;
  params: PipelineStepParams;
}

export interface PipelineConfig {
  version: number;
  dryRun?: boolean;
  steps: PipelineStep[];
}

export interface BudgetConfig {
  perRunUsd: number;
  monthlyUsd: number;
  alertOnPercent: number;
}

export interface RateLimitConfig {
  placesQps: number;
  llmConcurrency: number;
  enrichmentConcurrency: number;
}

export interface ScheduleConfig {
  cron: string;
  timezone: string;
  isActive: boolean;
}

export interface TruthScoreConfig {
  minInterviewsForLive: number;
  dimensionWeights: Record<string, number> | null;
  gradeBands: Record<string, number> | null;
  staleScoreDays: number;
}

export interface ObservabilityConfig {
  storeRawSourcePayload: boolean;
  traceLevel: 'basic' | 'verbose' | 'off';
}

export interface EffectiveDiscoveryConfig {
  pipeline: PipelineConfig;
  budgets: BudgetConfig;
  rateLimits: RateLimitConfig;
  schedule: ScheduleConfig;
  truthScore: TruthScoreConfig;
  observability: ObservabilityConfig;
}

export const REQUIRED_STEP_KEYS = ['places_search', 'dedup', 'score', 'publish_gate'] as const;
export type RequiredStepKey = typeof REQUIRED_STEP_KEYS[number];
