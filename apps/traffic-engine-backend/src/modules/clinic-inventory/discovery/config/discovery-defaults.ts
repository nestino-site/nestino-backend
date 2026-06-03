import { EffectiveDiscoveryConfig } from './discovery-pipeline.types';

export const DEFAULT_SYSTEM_CONFIG_DEFAULTS: EffectiveDiscoveryConfig = {
  pipeline: {
    version: 1,
    dryRun: false,
    steps: [
      {
        stepKey: 'places_search',
        enabled: true,
        params: {
          keywords: ['fertility clinic', 'IVF clinic', 'clinica fertilidad'],
          language: 'en',
          radiusKm: 25,
          maxResults: 60,
          pageDepth: 2,
        },
      },
      { stepKey: 'dedup', enabled: true, params: { strategy: 'placeId+domain+fuzzy', fuzzyMeters: 500, fuzzyNameSimilarity: 0.85 } },
      {
        stepKey: 'places_details',
        enabled: true,
        params: {
          fields: ['website', 'phone', 'opening_hours', 'photos', 'reviews', 'business_status'],
        },
      },
      {
        stepKey: 'website_fetch',
        enabled: true,
        params: {
          timeoutMs: 8000,
          maxPages: 3,
          pathHints: ['/precios', '/pricing', '/about', '/team', '/tratamientos'],
        },
      },
      { stepKey: 'llm_extract', enabled: false, params: { provider: 'openai', model: 'gpt-4o-mini', extract: ['services', 'accreditations', 'languages', 'doctors'], maxCostUsd: 0.1 } },
      { stepKey: 'llm_pricing', enabled: false, params: { provider: 'openai', model: 'gpt-4o-mini', minConfidence: 0.7, maxCostUsd: 0.05 } },
      {
        stepKey: 'score',
        enabled: true,
        params: {
          weights: {
            nameMatch: 0.25,
            websiteResolves: 0.15,
            fertilityTerms: 0.2,
            accreditation: 0.15,
            insidePolygon: 0.15,
            operational: 0.1,
          },
          publishThreshold: 0.85,
        },
      },
      {
        stepKey: 'publish_gate',
        enabled: true,
        params: {
          requireHumanReview: true,
          minimumFields: ['websiteUrl', 'addressLine'],
          maxAutoPublishesPerRun: 10,
        },
      },
    ],
  },
  budgets: { perRunUsd: 1.5, monthlyUsd: 50, alertOnPercent: 80 },
  rateLimits: { placesQps: 5, llmConcurrency: 2, enrichmentConcurrency: 4 },
  schedule: { cron: '0 3 * * 1', timezone: 'UTC', isActive: true },
  truthScore: { minInterviewsForLive: 5, dimensionWeights: null, gradeBands: null, staleScoreDays: 30 },
  observability: { storeRawSourcePayload: true, traceLevel: 'basic' },
};
