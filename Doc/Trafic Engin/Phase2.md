Below is your **final Phase 2 documentation (Cursor-friendly + production structured + fully English + multi-language support added)**.

I kept your original architecture, but upgraded it with:

* Multi-language generation (full support, not translation-based)
* Production-grade fixes (AI safety, scaling, retries, versioning readiness)
* Clean modular structure aligned with NestJS + Cursor rules style

---

# 🚀 Phase 2: AI Multi-Language Content Generation Engine (Final Spec)

---

# 🎯 Goal

Extend Phase 1 foundation into a **multi-language, AI-driven SEO content generation system** with:

* Structured AI pipeline (Outline → Draft → Optimize)
* Independent content generation per language (not translation)
* SEO + performance feedback loop
* External data ingestion (GSC + GA4)
* Automated scheduling + content lifecycle management

---

# 🧠 High-Level Architecture

```mermaid
flowchart TD

A[Keyword + Language Selector] --> B[SEO Brief Builder]
B --> C[AI Content Pipeline]

C --> C1[Outline Generation]
C1 --> C2[Draft Generation]
C2 --> C3[Optimization Loop]

C3 --> D[Content Analyzer]
D --> E[Page Storage (Multi-language)]

E --> F[GSC / GA4 Ingestion]
F --> G[Performance Evaluator]

G --> H[Content Refresh Decision]
H --> A

H --> I[Scheduler / Cron Jobs]
I --> B
```

---

# 🌍 Core Feature: Multi-Language Content System

## Principle

> Each language = independent SEO asset (NOT translation)

Each language has:

* Own keyword strategy
* Own SERP intent
* Own cultural tone
* Own performance tracking

---

# 🌐 Supported Languages

```ts
export enum ContentLanguage {
  EN = 'EN',
  AR = 'AR',
  DE = 'DE',
  FR = 'FR',
  ES = 'ES',
  IT = 'IT',
  TR = 'TR',
  NL = 'NL',
}
```

---

# 🗄️ Prisma Schema (Phase 2 Final)

---

## Site Model (updated)

```prisma
model Site {
  id               String @id @default(cuid())
  name             String

  defaultLanguage  ContentLanguage @default(EN)
  languages        ContentLanguage[]

  strategy         ContentStrategy @default(BALANCED)

  gscProperty      String?
  ga4PropertyId    String?

  createdAt        DateTime @default(now())
}
```

---

## Keyword Model (multi-language aware)

```prisma
model Keyword {
  id          String @id @default(cuid())

  siteId      String
  site        Site @relation(fields: [siteId], references: [id])

  keyword     String
  language    ContentLanguage

  searchVolume Int?
  difficulty   Float?
  intent      String?

  isUsed      Boolean @default(false)

  createdAt   DateTime @default(now())

  @@unique([siteId, keyword, language])
  @@index([siteId, language, isUsed])
}
```

---

## Page Model (multi-language content unit)

```prisma
model Page {
  id              String @id @default(cuid())

  siteId          String
  keywordId       String

  site            Site @relation(fields: [siteId], references: [id])
  keyword         Keyword @relation(fields: [keywordId], references: [id])

  language        ContentLanguage

  title           String
  slug            String

  metaTitle       String?
  metaDescription String?

  focusKeyword    String
  secondaryKeywords String[]

  outline         Json?
  rawDraft        String? @db.Text
  finalContent    String? @db.Text

  status          PageStatus @default(DRAFT)

  seoScore        Float?
  readabilityScore Float?
  wordCount       Int?

  publishedAt     DateTime?
  lastRefreshedAt DateTime?

  @@unique([siteId, slug, language])
  @@index([siteId, language, status])
}
```

---

## AI Generation Logs

```prisma
model AiGenerationLog {
  id               String @id @default(cuid())

  taskId           String
  provider         String
  model            String

  step             String // outline | draft | optimize

  promptTokens     Int
  completionTokens Int
  totalTokens      Int
  costUsd          Float
  durationMs       Int

  success          Boolean
  errorMessage     String?

  createdAt        DateTime @default(now())

  @@index([taskId])
}
```

---

## Keyword Research

```prisma
model KeywordResearch {
  id            String @id @default(cuid())

  siteId        String
  keyword       String
  language      ContentLanguage

  searchVolume  Int?
  difficulty    Float?
  intent        String?

  serpFeatures  String[]
  competitors   Json?

  source       String
  priority     Int @default(0)

  isUsed       Boolean @default(false)

  createdAt    DateTime @default(now())

  @@unique([siteId, keyword, language])
}
```

---

# 🤖 AI Provider Layer

## Strategy concept

```ts
export type AiStrategy = 'budget' | 'balanced' | 'quality';
```

Each step uses different model:

| Step     | Purpose                 |
| -------- | ----------------------- |
| outline  | structured SEO planning |
| draft    | long-form generation    |
| optimize | SEO + readability fix   |

---

## Provider abstraction

```ts
interface AiProviderClient {
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
```

---

## Supported providers

* OpenAI
* Anthropic
* Google Gemini

---

# 🧠 AI Pipeline (Core Engine)

```ts
Outline → Draft → Analyze → Optimize → Store
```

---

## Pipeline rules

* Outline = JSON structured SEO plan
* Draft = long-form article
* Optimize = only fixes issues (not full rewrite unless needed)
* Max 2 optimization loops

---

## Safety rule

```ts
if (seoScore < 75 && attempts < 2) {
  optimize();
}
```

---

# 🌍 Multi-Language SEO Brief Builder

## Responsibility

Generates **language-aware content strategy**

---

## SeoBrief

```ts
interface SeoBrief {
  language: ContentLanguage;

  keyword: string;
  secondaryKeywords: string[];

  intent: 'informational' | 'commercial' | 'transactional';

  targetWordCount: number;

  tone: 'professional' | 'friendly' | 'authoritative';

  siteContext: {
    siteName: string;
    description: string;
    location?: string;
  };

  culturalContext?: {
    region: string;
    writingStyle: string;
  };
}
```

---

## Language behavior rule

| Language | Strategy                    |
| -------- | --------------------------- |
| EN       | default global SEO          |
| AR       | formal + culturally adapted |
| DE       | structured + technical      |
| FR       | persuasive + elegant        |

---

# ✍️ Prompt Engineering Layer

---

## Outline Prompt

* returns STRICT JSON
* no markdown allowed
* structured H1, H2, FAQ

---

## Draft Prompt Rules

* keyword in first paragraph
* 1.5%–2.5% density
* natural language
* internal links injected
* no robotic phrasing

---

## Optimize Prompt

* fixes only issues
* does NOT rewrite full article
* uses analyzer feedback

---

# 📊 Content Analyzer (SEO Engine)

## Metrics

* word count
* keyword density
* H2 structure
* CTA detection
* FAQ detection
* readability score
* paragraph structure

---

## SEO Score (0–100)

Weighted system:

* keyword optimization: 20%
* structure: 15%
* CTA: 10%
* FAQ: 10%
* readability: 5%
* content length: 10%

---

# 📈 Analytics Layer

---

## GSC Integration

* clicks
* impressions
* CTR
* average position
* query-level data

---

## GA4 Integration

* sessions
* bounce rate
* conversions
* session duration

---

## Sync Strategy

```txt
Daily Cron:
- fetch GSC data
- fetch GA4 data
- store into SEO metrics table
```

---

# 🧠 Performance Evaluator

## Output

```ts
interface PerformanceScore {
  overall: number;

  traffic: number;
  engagement: number;
  conversion: number;
  seo: number;

  recommendations: string[];
}
```

---

## Decision engine

* detect underperforming pages
* suggest optimization
* trigger content refresh pipeline

---

# ⏰ Scheduler System

## Cron jobs

```ts
CONTENT_GENERATION_CRON = 03:00
METRICS_INGESTION_CRON = 02:00
PERFORMANCE_EVAL_CRON = 04:00
```

---

## Responsibilities

* generate new content daily
* refresh outdated pages
* ingest analytics data
* evaluate site health

---

# ⚠️ Production Improvements (Important Fixes)

## 1. AI Queue separation (mandatory)

AI calls MUST move to worker queue:

```txt
content-task → ai-generation-queue → processor → DB
```

---

## 2. Cost control layer

* per-site budget limit
* per-day token cap
* provider fallback

---

## 3. Retry system

* exponential backoff
* provider fallback chain

---

## 4. Content versioning (recommended)

```ts
PageVersion {
  pageId
  content
  seoScore
  createdAt
}
```

---

## 5. Parallelization fix

* batch GSC sync
* concurrency limit in scheduler

---

# 🧭 Final System Definition

## Phase 2 =

> A multi-language autonomous SEO content generation system with analytics-driven optimization loop

---

# 🚀 Output of Phase 2

System can now:

* generate SEO content in multiple languages
* adapt content culturally per region
* optimize content automatically
* track real-world performance
* decide what to regenerate
* scale across sites globally

---


