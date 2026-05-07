# Traffic Engine Backend (Phase 1 + Phase 2)

## Setup

1. Install dependencies: `npm install`
2. Copy env: `cp .env.example .env`
3. Generate Prisma client: `npm run prisma:generate`
4. Run migrations: `npm run prisma:migrate:dev -- --name phase2_ai_engine` (or `prisma migrate deploy` in CI)
5. Start API + workers: `npm run start:dev`

Ensure **PostgreSQL** and **Redis** are running locally.

## Phase 2 overview

- **Multi-language**: `Site.defaultLanguage`, `Site.languages[]`, `Keyword.keyword` + `Keyword.language`, `Page.language`.
- **Keyword grouping**: `Keyword.baseKeywordId` self-FK; `GET /api/v1/keywords/cluster?baseKeywordId=...`
- **Keyword research (manual only)**: `POST /api/v1/keyword-research` with `source=MANUAL`
- **Versioned AI pipeline**: `PATCH /api/v1/sites/:id/ai-pipeline` with `{ version, steps[] }` (min 3 steps, unique `stepKey`, each step requires `promptTemplateId`)
- **Queues**: `traffic-engine.ai.generate` (jobId = `pageId`), `traffic-engine.analytics.sync`
- **AI stub mode**: set `AI_STUB=true` in `.env` to run the pipeline without external API keys

## Default AI pipeline JSON (example)

After creating a site, patch:

```json
{
  "version": 1,
  "steps": [
    { "stepKey": "outline", "provider": "openai", "model": "gpt-4o", "promptTemplateId": "outline_v1" },
    { "stepKey": "draft", "provider": "openai", "model": "gpt-4o", "promptTemplateId": "draft_v1" },
    { "stepKey": "analyze", "provider": "openai", "model": "gpt-4o", "promptTemplateId": "analyze_v1" },
    { "stepKey": "optimize", "provider": "openai", "model": "gpt-4o", "promptTemplateId": "optimize_v1" }
  ]
}
```

## Verification checklist (Phase 2)

- [ ] Tables: `sites`, `keywords`, `pages`, `content_tasks`, `seo_metrics`, `keyword_research`, `ai_generation_logs`
- [ ] `PATCH /api/v1/sites/:id/ai-pipeline` validates >= 3 steps and unique `stepKey`
- [ ] `POST /api/v1/pages` requires `keywordId`, supports `language`
- [ ] `POST /api/v1/content-tasks` with `pageId` enqueues `traffic-engine.ai.generate` with `jobId = pageId`
- [ ] Pipeline completes (with `AI_STUB=true`): `Page.outline`, `rawDraft`, `finalContent`, scores, `optimizationCount`
- [ ] `ai_generation_logs` rows contain `promptHash` only (no raw prompts)
- [ ] Cron enqueues metrics sync (see `TrafficEngineSchedulerService`)

## Queue guarantees

- BullMQ + `@nestjs/bullmq` + `ioredis` only
- AI generation: deterministic `jobId = pageId`, payload `{ pageId, contentTaskId? }`
- Content task claim: atomic `QUEUED → PROCESSING` when `contentTaskId` is present
