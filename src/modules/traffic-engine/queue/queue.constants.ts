/** Legacy Phase 1 queue — avoid new work here; prefer `TRAFFIC_ENGINE_AI_QUEUE`. */
export const TRAFFIC_ENGINE_QUEUE = 'traffic-engine.content.generate';
export const TRAFFIC_ENGINE_JOB_PROCESS = 'traffic-engine.content.process';

export const TRAFFIC_ENGINE_AI_QUEUE = 'traffic-engine.ai.generate';
export const TRAFFIC_ENGINE_AI_JOB_PROCESS = 'traffic-engine.ai.process';

export const TRAFFIC_ENGINE_ANALYTICS_QUEUE = 'traffic-engine.analytics.sync';
export const TRAFFIC_ENGINE_ANALYTICS_JOB_SYNC = 'traffic-engine.analytics.run';

export const TRAFFIC_ENGINE_IDEA_GENERATION_QUEUE = 'traffic-engine.idea.generate';
export const TRAFFIC_ENGINE_IDEA_JOB_PROCESS = 'traffic-engine.idea.process';

export const TRAFFIC_ENGINE_WEBHOOK_QUEUE = 'traffic-engine.webhook.retry';
export const TRAFFIC_ENGINE_WEBHOOK_JOB_RETRY = 'traffic-engine.webhook.process';
