

# 🟡 Traffic Engine — Phase 3 (FINAL / CURSOR-READY / PRODUCTION SPEC)

## 🧠 Vision

Traffic Engine is a:

> **Config-driven AI Content Operating System optimized for low-cost, high-quality, scalable SEO content generation with Next.js-ready output.**

---

# 1. 🧩 System Architecture (FINAL)

```txt
TrafficEngine
│
├── Core Pipeline
│   ├── GenerationService
│   ├── AnalysisService
│   ├── RewriteService
│
├── AI Layer
│   ├── AIModelRouter
│   ├── PromptEngine
│   ├── AIExecutionService
│   ├── CostController
│
├── Config Layer (DB + Cache)
│   ├── SiteConfigService
│   ├── PipelineConfigService
│   ├── PromptConfigService
│   ├── ModelConfigService
│
├── Intelligence Layer
│   ├── KeywordIntentClassifier
│   ├── ContentScoringService
│   ├── ContentPolicyEngine
│
├── Pipeline Orchestrator
│   ├── TrafficEnginePipelineService
│
├── Output Layer
│   ├── ContentStateManager
│   ├── NextJsContractMapper
│
├── Queue Layer
│   ├── AIJobProcessor (BullMQ)
│
└── Observability
    ├── AiGenerationLog
    ├── MetricsService
    ├── ErrorTracker
```

---

# 2. ⚙️ CONFIG SYSTEM (FULLY DYNAMIC — CORE OF SYSTEM)

## 2.1 Storage Strategy

Config is stored in:

* PostgreSQL (source of truth)
* Redis (cache layer)

---

## 2.2 Site Config (MASTER CONFIG)

```ts
type SiteConfig = {
  siteId: string;

  aiBudgetLimit: number;
  defaultLanguage: string;

  qualityThreshold: number;

  pipeline: PipelineConfig;
  models: ModelConfig;
  prompts: PromptConfig;

  runtime: {
    enableAnalysis: boolean;
    enableRewrite: boolean;
    maxRetries: number;
  };
};
```

---

## 2.3 Pipeline Config

```ts
type PipelineConfig = {
  steps: ("generate" | "analyze" | "rewrite")[];

  options: {
    skipAnalysis: boolean;
    skipRewrite: boolean;
    strictMode: boolean;
  };
};
```

---

## 2.4 Model Config (AI ROUTING CORE)

```ts
type ModelConfig = {
  generate: string;
  analyze: string;
  rewrite: string;

  rules: {
    highPriority: string;
    lowPriority: string;
    fallback: string;
  };
};
```

---

## 2.5 Prompt Config (VERSIONED SYSTEM)

```ts
type PromptConfig = {
  generateVersion: string;
  analyzeVersion: string;
  rewriteVersion: string;

  tone: "seo" | "conversational" | "formal";
  localeSupport: boolean;
};
```

---

# 3. 🤖 AI LAYER (FULL IMPLEMENTATION DESIGN)

## 3.1 AIModelRouter

Responsible for selecting model dynamically.

```ts
resolve(context: {
  step: "generate" | "analyze" | "rewrite";
  keywordIntent: string;
  priority: "low" | "medium" | "high";
  siteId: string;
})
```

### Rules:

* high priority → strong model
* low priority → cheap model
* rewrite → balanced model
* budget exceeded → downgrade automatically

---

## 3.2 AIExecutionService (NEW CRITICAL LAYER)

Single entry point for all AI calls.

```ts
execute(prompt, modelConfig): Promise<string>
```

Responsibilities:

* call LLM
* log cost
* handle retry
* normalize output

---

## 3.3 CostController

```ts
checkBudget(siteId): boolean
```

If budget exceeded:

* downgrade model
* skip analysis if allowed
* reduce token usage

---

# 4. 🧠 PROMPT ENGINE (PRODUCTION VERSION)

## Structure

```ts
getPrompt(type: "generate" | "analyze" | "rewrite", context)
```

## Features:

* versioned prompts
* site-specific override
* locale injection
* tone control
* fallback prompts

---

# 5. 🧱 CORE PIPELINE (FINAL IMPLEMENTATION)

## 5.1 Pipeline Flow

```txt
GENERATE → ANALYZE → REWRITE
```

BUT controlled by config:

```ts
pipeline.run(pageId, siteConfig);
```

---

## 5.2 GenerationService

Responsibilities:

* SEO outline
* full article
* FAQ
* entities injection

---

## 5.3 AnalysisService

```ts
{
  seoScore: number;
  readabilityScore: number;
  intentMatch: number;
  issues: string[];
}
```

---

## 5.4 RewriteService

* fix issues
* improve SEO
* improve readability
* rewrite tone
* remove redundancy

---

# 6. 🔁 PIPELINE ORCHESTRATOR (IMPORTANT)

## TrafficEnginePipelineService

```ts
async run(pageId: string) {
  const config = await getSiteConfig(pageId);

  const draft = await generate();
  
  if (config.runtime.enableAnalysis) {
    const analysis = await analyze(draft);
  }

  if (config.runtime.enableRewrite) {
    const final = await rewrite(draft, analysis);
  }

  return final;
}
```

---

# 7. 📊 CONTENT INTELLIGENCE LAYER

## Keyword Classification

```ts
type KeywordIntent =
  | "informational"
  | "transactional"
  | "navigational";
```

---

## Content Scoring

* SEO score
* readability
* intent match
* content depth

---

# 8. 🧾 CONTENT STATE MACHINE (NEXT.JS READY)

```ts
type ContentState = {
  pageId: string;

  status:
    | "draft"
    | "generating"
    | "analyzing"
    | "rewriting"
    | "ready";

  draft?: string;
  analysis?: AnalysisResult;
  finalContent?: string;
};
```

---

# 9. 🌐 NEXT.JS INTEGRATION CONTRACT (VERY IMPORTANT)

## API

```http
GET /api/content/:pageId
```

## Response

```json
{
  "status": "ready",
  "draft": "...",
  "analysis": {
    "seoScore": 85
  },
  "finalContent": "..."
}
```

---

## Frontend Features Enabled:

* live generation UI
* preview draft
* final content render
* progress tracking

---

# 10. 🧾 AI LOGGING SYSTEM

```ts
AiGenerationLog {
  step;
  model;
  tokens;
  cost;
  latency;
}
```

---

# 11. 💰 COST OPTIMIZATION ENGINE (CORE VALUE)

## Rules:

* max 3 AI calls per page
* downgrade models automatically
* skip analysis if LOW priority
* reuse cached prompts when possible

---

# 12. 🔁 RETRY + ERROR HANDLING (NEW)

## Retry Strategy:

* max retries per step: 2
* exponential backoff
* fallback model if failure persists

---

# 13. 🚫 OUT OF SCOPE (LOCKED FOR PHASE 3)

* publishing system (WordPress/Ghost/etc)
* external SEO tools
* backlink automation
* SERP scraping
* multi-agent AI

---

# 14. 🧪 EXECUTION CHECKLIST (CURSOR READY)

✔ Config loads per site
✔ Pipeline executes step-by-step
✔ AI router selects correct model
✔ Prompt engine returns correct template
✔ Analysis returns structured JSON
✔ Rewrite improves output
✔ Content state updated
✔ Logs stored
✔ Cost tracked
✔ API returns Next.js ready contract

---

# 15. 🎯 FINAL SYSTEM DEFINITION

Traffic Engine Phase 3 is now:

> A fully configurable AI Content Operating System with cost-aware model routing, versioned prompt engine, deterministic pipeline execution, and Next.js-ready output contracts.

---

