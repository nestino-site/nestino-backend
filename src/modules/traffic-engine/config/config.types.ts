export type PipelineStepKey =
  | 'generate'
  | 'analyze'
  | 'rewrite'
  | 'image_generation'
  | 'seo_check';

export interface PipelineConfig {
  steps: PipelineStepKey[];
  options: {
    strictMode: boolean;
    skipAnalysis: boolean;
    skipRewrite: boolean;
  };
}

export interface ModelConfig {
  generate: string;
  analyze: string;
  rewrite: string;
  image_generation: string;
  seo_check: string;
  rules: {
    highPriority: string;
    lowPriority: string;
    fallback: string;
  };
}

export interface HumanizationSettings {
  enabled: boolean;
  level: 'low' | 'medium' | 'high';
}

export interface PromptConfig {
  generateVersion: string;
  analyzeVersion: string;
  rewriteVersion: string;
  imageGenerationVersion: string;
  seoCheckVersion: string;
  tone: 'seo' | 'conversational' | 'formal';
  localeSupport: boolean;
  locale?: string;
  abTestingEnabled?: boolean;
  /** Defaults applied in SiteConfigService when omitted in stored JSON. */
  humanization: HumanizationSettings;
}

export interface RuntimeConfig {
  enableAnalysis: boolean;
  enableRewrite: boolean;
  enableImageGeneration: boolean;
  enableSeoCheck: boolean;
  maxRetries: number;
}

export interface SiteConfigRecord {
  siteId: number;
  aiBudgetLimit: number;
  qualityThreshold: number;
  pipelineConfig: PipelineConfig;
  modelConfig: ModelConfig;
  promptConfig: PromptConfig;
  runtimeConfig: RuntimeConfig;
}
