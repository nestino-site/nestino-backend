

# Phase 2: AI Content Generation Engine

## معماری Phase 2

Phase 1 (Foundation)
        ↓
Phase 2 adds:
├── AI Provider Abstraction Layer     ← swap models without touching business logic
├── SEO Brief Builder                 ← structured prompt engineering
├── Content Generation Pipeline       ← outline → draft → optimize → save
├── GSC/GA4 Ingestion Service         ← real metrics into seo_metrics table
├── Performance Evaluator             ← score pages, flag underperformers
└── Scheduler (Cron)                  ← daily keyword discovery + task creation


---

## 1. Environment Variables (additions to `.env`)

```bash
# .env additions for Phase 2

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...

# Default AI model strategy: "budget" | "balanced" | "quality"
AI_STRATEGY=balanced

# Google Search Console
GSC_CLIENT_EMAIL=nestino@project.iam.gserviceaccount.com
GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GSC_PROPERTY_URL=https://nestino.com

# Google Analytics 4
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=nestino@project.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Content Generation
DAILY_CONTENT_LIMIT=10
CONTENT_GENERATION_CRON=0 3 * * *
METRICS_INGESTION_CRON=0 2 * * *
PERFORMANCE_EVAL_CRON=0 4 * * *

# Underperformance thresholds
UNDERPERFORM_CTR_THRESHOLD=0.02
UNDERPERFORM_POSITION_THRESHOLD=20
UNDERPERFORM_DAYS_OLD=30
```

---

## 2. Prisma Schema Updates

```prisma
// prisma/schema.prisma — Phase 2 additions (append to Phase 1 schema)

enum ContentStrategy {
  BUDGET
  BALANCED
  QUALITY
}

enum PageStatus {
  DRAFT
  PUBLISHED
  NEEDS_REFRESH
  ARCHIVED
}

// Update existing Site model — add these fields
// (add inside the Site model block)
//   strategy    ContentStrategy @default(BALANCED)
//   gscProperty String?
//   ga4PropertyId String?

// Update existing Page model — add these fields
//   status         PageStatus  @default(DRAFT)
//   seoScore       Float?
//   readabilityScore Float?
//   wordCount      Int?
//   publishedAt    DateTime?
//   lastRefreshedAt DateTime?
//   outline        Json?
//   rawDraft       String?     @db.Text
//   finalContent   String?     @db.Text
//   metaTitle      String?
//   metaDescription String?
//   focusKeyword   String?
//   secondaryKeywords String[]

model AiGenerationLog {
  id           String   @id @default(cuid())
  taskId       String
  task         ContentTask @relation(fields: [taskId], references: [id])
  provider     String   // "openai" | "anthropic" | "google"
  model        String
  promptTokens Int
  completionTokens Int
  totalTokens  Int
  costUsd      Float
  durationMs   Int
  step         String   // "outline" | "draft" | "optimize"
  success      Boolean
  errorMessage String?
  createdAt    DateTime @default(now())

  @@index([taskId])
  @@index([createdAt])
}

model KeywordResearch {
  id            String   @id @default(cuid())
  siteId        String
  site          Site     @relation(fields: [siteId], references: [id])
  keyword       String
  searchVolume  Int?
  difficulty    Float?
  cpc           Float?
  intent        String?  // "informational" | "commercial" | "transactional" | "navigational"
  serpFeatures  String[]
  competitors   Json?
  source        String   // "manual" | "gsc" | "ahrefs" | "semrush"
  priority      Int      @default(0)
  isUsed        Boolean  @default(false)
  createdAt     DateTime @default(now())

  @@unique([siteId, keyword])
  @@index([siteId, isUsed, priority])
}
```

```bash
npx prisma migrate dev --name phase2_ai_engine
```

---

## 3. Package Installations

```bash
npm install \
  @anthropic-ai/sdk \
  openai \
  @google/generative-ai \
  googleapis \
  @google-analytics/data \
  tiktoken \
  zod \
  @nestjs/schedule \
  @nestjs/config
```

---

## 4. AI Provider Abstraction Layer

```typescript
// src/ai/types/ai.types.ts

export type AiProvider = 'openai' | 'anthropic' | 'google';

export type AiStrategy = 'budget' | 'balanced' | 'quality';

export interface AiModelConfig {
  provider: AiProvider;
  model: string;
  maxTokens: number;
  temperature: number;
  costPer1kInputTokens: number;   // USD
  costPer1kOutputTokens: number;  // USD
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
}

export interface AiCompletionResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  provider: AiProvider;
  model: string;
}

export interface AiProviderClient {
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
```

```typescript
// src/ai/strategies/ai-model.strategy.ts
import { AiModelConfig, AiStrategy } from '../types/ai.types';

// Strategy matrix — swap models here without touching any other file
export const AI_MODEL_STRATEGIES: Record<AiStrategy, {
  outline: AiModelConfig;
  draft: AiModelConfig;
  optimize: AiModelConfig;
}> = {
  budget: {
    outline: {
      provider: 'google',
      model: 'gemini-1.5-flash',
      maxTokens: 1024,
      temperature: 0.3,
      costPer1kInputTokens: 0.000075,
      costPer1kOutputTokens: 0.0003,
    },
    draft: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 4096,
      temperature: 0.7,
      costPer1kInputTokens: 0.00025,
      costPer1kOutputTokens: 0.00125,
    },
    optimize: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 2048,
      temperature: 0.3,
      costPer1kInputTokens: 0.00025,
      costPer1kOutputTokens: 0.00125,
    },
  },
  balanced: {
    outline: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxTokens: 1024,
      temperature: 0.3,
      costPer1kInputTokens: 0.00015,
      costPer1kOutputTokens: 0.0006,
    },
    draft: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      maxTokens: 6000,
      temperature: 0.7,
      costPer1kInputTokens: 0.003,
      costPer1kOutputTokens: 0.015,
    },
    optimize: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxTokens: 2048,
      temperature: 0.3,
      costPer1kInputTokens: 0.00015,
      costPer1kOutputTokens: 0.0006,
    },
  },
  quality: {
    outline: {
      provider: 'openai',
      model: 'gpt-4o',
      maxTokens: 2048,
      temperature: 0.3,
      costPer1kInputTokens: 0.005,
      costPer1kOutputTokens: 0.015,
    },
    draft: {
      provider: 'anthropic',
      model: 'claude-opus-4-5',
      maxTokens: 8000,
      temperature: 0.7,
      costPer1kInputTokens: 0.015,
      costPer1kOutputTokens: 0.075,
    },
    optimize: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      maxTokens: 4096,
      temperature: 0.3,
      costPer1kInputTokens: 0.003,
      costPer1kOutputTokens: 0.015,
    },
  },
};
```

```typescript
// src/ai/providers/openai.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import {
  AiProviderClient,
  AiCompletionRequest,
  AiCompletionResponse,
  AiModelConfig,
} from '../types/ai.types';

@Injectable()
export class OpenAiProvider implements AiProviderClient {
  private readonly logger = new Logger(OpenAiProvider.name);
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(
    request: AiCompletionRequest,
    config: AiModelConfig,
  ): Promise<AiCompletionResponse> {
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model: config.model,
      messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: request.maxTokens ?? config.maxTokens,
      temperature: request.temperature ?? config.temperature,
      response_format:
        request.responseFormat === 'json'
          ? { type: 'json_object' }
          : { type: 'text' },
    });

    const durationMs = Date.now() - start;
    const usage = response.choices[0];
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;
    const costUsd =
      (promptTokens / 1000) * config.costPer1kInputTokens +
      (completionTokens / 1000) * config.costPer1kOutputTokens;

    return {
      content: response.choices[0].message.content ?? '',
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      durationMs,
      provider: 'openai',
      model: config.model,
    };
  }
}
```

```typescript
// src/ai/providers/anthropic.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  AiProviderClient,
  AiCompletionRequest,
  AiCompletionResponse,
  AiModelConfig,
} from '../types/ai.types';

@Injectable()
export class AnthropicProvider implements AiProviderClient {
  private readonly logger = new Logger(AnthropicProvider.name);
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(
    request: AiCompletionRequest,
    config: AiModelConfig,
  ): Promise<AiCompletionResponse> {
    const start = Date.now();

    // Anthropic separates system from user messages
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const userMessages = request.messages.filter((m) => m.role !== 'system');

    const response = await this.client.messages.create({
      model: config.model,
      max_tokens: request.maxTokens ?? config.maxTokens,
      temperature: request.temperature ?? config.temperature,
      system: systemMsg?.content,
      messages: userMessages as Anthropic.MessageParam[],
    });

    const durationMs = Date.now() - start;
    const promptTokens = response.usage.input_tokens;
    const completionTokens = response.usage.output_tokens;
    const costUsd =
      (promptTokens / 1000) * config.costPer1kInputTokens +
      (completionTokens / 1000) * config.costPer1kOutputTokens;

    const content =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      content,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      durationMs,
      provider: 'anthropic',
      model: config.model,
    };
  }
}
```

```typescript
// src/ai/providers/google.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiModelConfig,
} from '../types/ai.types';

@Injectable()
export class GoogleAiProvider {
  private readonly logger = new Logger(GoogleAiProvider.name);
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(
    request: AiCompletionRequest,
    config: AiModelConfig,
  ): Promise<AiCompletionResponse> {
    const start = Date.now();

    const model = this.client.getGenerativeModel({ model: config.model });

    const systemMsg = request.messages.find((m) => m.role === 'system');
    const userMsg = request.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');

    const prompt = systemMsg
      ? `${systemMsg.content}\n\n${userMsg}`
      : userMsg;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? config.maxTokens,
        temperature: request.temperature ?? config.temperature,
      },
    });

    const durationMs = Date.now() - start;
    const content = result.response.text();
    const usage = result.response.usageMetadata;
    const promptTokens = usage?.promptTokenCount ?? 0;
    const completionTokens = usage?.candidatesTokenCount ?? 0;
    const costUsd =
      (promptTokens / 1000) * config.costPer1kInputTokens +
      (completionTokens / 1000) * config.costPer1kOutputTokens;

    return {
      content,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      durationMs,
      provider: 'google',
      model: config.model,
    };
  }
}
```

```typescript
// src/ai/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleAiProvider } from './providers/google.provider';
import { AI_MODEL_STRATEGIES } from './strategies/ai-model.strategy';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiStrategy,
} from './types/ai.types';

type GenerationStep = 'outline' | 'draft' | 'optimize';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAiProvider;
  private anthropic: AnthropicProvider;
  private google: GoogleAiProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAiProvider(config.get('OPENAI_API_KEY') ?? '');
    this.anthropic = new AnthropicProvider(config.get('ANTHROPIC_API_KEY') ?? '');
    this.google = new GoogleAiProvider(config.get('GOOGLE_AI_API_KEY') ?? '');
  }

  async complete(
    request: AiCompletionRequest,
    step: GenerationStep,
    strategy: AiStrategy = 'balanced',
    taskId?: string,
  ): Promise<AiCompletionResponse> {
    const modelConfig = AI_MODEL_STRATEGIES[strategy][step];
    const start = Date.now();

    let response: AiCompletionResponse;

    try {
      switch (modelConfig.provider) {
        case 'openai':
          response = await this.openai.complete(request, modelConfig);
          break;
        case 'anthropic':
          response = await this.anthropic.complete(request, modelConfig);
          break;
        case 'google':
          response = await this.google.complete(request, modelConfig);
          break;
        default:
          throw new Error(`Unknown provider: ${modelConfig.provider}`);
      }

      // log to DB if taskId provided
      if (taskId) {
        await this.logGeneration(taskId, response, step, true);
      }

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (taskId) {
        await this.logGeneration(
          taskId,
          {
            provider: modelConfig.provider,
            model: modelConfig.model,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            costUsd: 0,
            durationMs: Date.now() - start,
            content: '',
          },
          step,
          false,
          message,
        );
      }
      throw err;
    }
  }

  private async logGeneration(
    taskId: string,
    response: AiCompletionResponse,
    step: string,
    success: boolean,
    errorMessage?: string,
  ) {
    try {
      await this.prisma.aiGenerationLog.create({
        data: {
          taskId,
          provider: response.provider,
          model: response.model,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          totalTokens: response.totalTokens,
          costUsd: response.costUsd,
          durationMs: response.durationMs,
          step,
          success,
          errorMessage,
        },
      });
    } catch (logErr) {
      this.logger.warn(`Failed to log AI generation: ${logErr}`);
    }
  }

  async getMonthlyCost(siteId?: string): Promise<number> {
    const from = new Date();
    from.setDate(1);
    from.setHours(0, 0, 0, 0);

    const logs = await this.prisma.aiGenerationLog.findMany({
      where: {
        createdAt: { gte: from },
        success: true,
        ...(siteId
          ? { task: { siteId } }
          : {}),
      },
      select: { costUsd: true },
    });

    return logs.reduce((sum, l) => sum + l.costUsd, 0);
  }
}
```

```typescript
// src/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
```

---

## 5. SEO Brief Builder

```typescript
// src/seo-brief/seo-brief.types.ts

export interface SeoBrief {
  keyword: string;
  secondaryKeywords: string[];
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  targetWordCount: number;
  targetAudience: string;
  contentType: 'blog_post' | 'landing_page' | 'guide' | 'comparison' | 'listicle';
  siteContext: {
    siteName: string;
    siteDescription: string;
    location?: string;
    propertyType?: string;
  };
  competitors: string[];
  mustIncludeSections: string[];
  internalLinks: Array<{ anchor: string; url: string }>;
  tone: 'professional' | 'friendly' | 'authoritative' | 'conversational';
  language: 'en';
}
```

```typescript
// src/seo-brief/seo-brief.builder.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SeoBrief } from './seo-brief.types';

@Injectable()
export class SeoBriefBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(keywordId: string, siteId: string): Promise<SeoBrief> {
    const [keyword, site, relatedPages] = await Promise.all([
      this.prisma.keyword.findUniqueOrThrow({ where: { id: keywordId } }),
      this.prisma.site.findUniqueOrThrow({ where: { id: siteId } }),
      this.prisma.page.findMany({
        where: { siteId, status: 'PUBLISHED' },
        select: { title: true, slug: true, focusKeyword: true },
        take: 10,
      }),
    ]);

    const internalLinks = relatedPages
      .filter((p) => p.slug && p.title)
      .map((p) => ({
        anchor: p.title ?? p.focusKeyword ?? '',
        url: `/${p.slug}`,
      }));

    const siteConfig = (site.config as Record<string, unknown>) ?? {};

    return {
      keyword: keyword.keyword,
      secondaryKeywords: (keyword.relatedKeywords as string[]) ?? [],
      intent: this.detectIntent(keyword.keyword),
      targetWordCount: this.calcWordCount(keyword.difficulty ?? 50),
      targetAudience:
        (siteConfig.targetAudience as string) ?? 'travelers and vacation rental guests',
      contentType: this.detectContentType(keyword.keyword),
      siteContext: {
        siteName: site.name,
        siteDescription: (siteConfig.description as string) ?? '',
        location: (siteConfig.location as string) ?? undefined,
        propertyType: (siteConfig.propertyType as string) ?? undefined,
      },
      competitors: (siteConfig.competitors as string[]) ?? [],
      mustIncludeSections: this.buildRequiredSections(keyword.keyword),
      internalLinks,
      tone: 'friendly',
      language: 'en',
    };
  }

  private detectIntent(keyword: string): SeoBrief['intent'] {
    const kw = keyword.toLowerCase();
    if (/price|book|rent|reserve|buy|cost/.test(kw)) return 'transactional';
    if (/best|compare|vs|top|review/.test(kw)) return 'commercial';
    if (/how|guide|tips|what|why|tutorial/.test(kw)) return 'informational';
    return 'informational';
  }

  private calcWordCount(difficulty: number): number {
    // harder keywords need longer, more authoritative content
    if (difficulty >= 70) return 2500;
    if (difficulty >= 40) return 1800;
    return 1200;
  }

  private detectContentType(keyword: string): SeoBrief['contentType'] {
    const kw = keyword.toLowerCase();
    if (/best|top \d|list/.test(kw)) return 'listicle';
    if (/guide|how to|tutorial/.test(kw)) return 'guide';
    if (/vs|compare|comparison/.test(kw)) return 'comparison';
    if (/rent|book|price|deal/.test(kw)) return 'landing_page';
    return 'blog_post';
  }

  private buildRequiredSections(keyword: string): string[] {
    const base = [
      'Engaging introduction with a strong hook',
      'Main topic explanation',
      'Key benefits and features',
      'Practical tips and actionable advice',
      'FAQ section',
      'Conclusion with CTA',
    ];

    if (/villa|cabin|rental|property|accommodation/.test(keyword.toLowerCase())) {
      base.splice(2, 0, 'Amenities and facilities', 'Location and accessibility');
    }

    return base;
  }
}
```

```typescript
// src/seo-brief/seo-brief.module.ts
import { Module } from '@nestjs/common';
import { SeoBriefBuilder } from './seo-brief.builder';

@Module({
  providers: [SeoBriefBuilder],
  exports: [SeoBriefBuilder],
})
export class SeoBriefModule {}
```

---

## 6. Prompt Templates

```typescript
// src/ai/prompts/outline.prompt.ts
import { SeoBrief } from '../../seo-brief/seo-brief.types';

export function buildOutlinePrompt(brief: SeoBrief): string {
  const locationLine = brief.siteContext.location
    ? `- Location focus: ${brief.siteContext.location}`
    : '';
  const propertyLine = brief.siteContext.propertyType
    ? `- Property type: ${brief.siteContext.propertyType}`
    : '';

  return `You are an expert SEO content strategist specializing in vacation rentals and short-term accommodation.

Create a detailed content outline for the SEO brief below.

BRIEF:
- Focus keyword: ${brief.keyword}
- Secondary keywords: ${brief.secondaryKeywords.join(', ')}
- Content type: ${brief.contentType}
- Target word count: ${brief.targetWordCount} words
- Search intent: ${brief.intent}
- Tone: ${brief.tone}
- Target audience: ${brief.targetAudience}

SITE CONTEXT:
- Site name: ${brief.siteContext.siteName}
- Description: ${brief.siteContext.siteDescription}
${locationLine}
${propertyLine}

REQUIRED SECTIONS: ${brief.mustIncludeSections.join(' | ')}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "title": "SEO-optimized H1 title (include focus keyword)",
  "metaTitle": "Meta title under 60 characters",
  "metaDescription": "Meta description 150-160 chars, include focus keyword naturally",
  "slug": "url-friendly-slug-with-keyword",
  "sections": [
    {
      "heading": "H2 heading text",
      "subheadings": ["H3 subheading 1", "H3 subheading 2"],
      "keyPoints": ["key point to cover in this section"],
      "targetKeywords": ["keyword to include naturally here"],
      "estimatedWords": 300
    }
  ],
  "faqItems": [
    {
      "question": "Full question text",
      "answerHint": "Brief hint for the writer"
    }
  ],
  "internalLinkOpportunities": ["anchor text suggestion 1", "anchor text suggestion 2"]
}`;
}
```

```typescript
// src/ai/prompts/draft.prompt.ts
import { SeoBrief } from '../../seo-brief/seo-brief.types';

export function buildDraftPrompt(brief: SeoBrief, outline: Record<string, unknown>): string {
  const internalLinksText = brief.internalLinks
    .slice(0, 5)
    .map((l) => `- [${l.anchor}](${l.url})`)
    .join('\n');

  return `You are an expert content writer specializing in vacation rentals, villas, and short-term accommodations.

Write a complete, high-quality English article based on the outline below.

PARAMETERS:
- Focus keyword: ${brief.keyword}
- Secondary keywords: ${brief.secondaryKeywords.join(', ')}
- Target word count: ${brief.targetWordCount} words (±10% is acceptable)
- Tone: ${brief.tone}
- Content type: ${brief.contentType}
- Target audience: ${brief.targetAudience}
- Site: ${brief.siteContext.siteName}

OUTLINE:
${JSON.stringify(outline, null, 2)}

INTERNAL LINKS (weave these in naturally where relevant):
${internalLinksText || 'None available yet — skip this step'}

WRITING RULES:
1. Write in natural, fluent English — no robotic or keyword-stuffed sentences
2. Include the focus keyword in: the first paragraph, at least 2 H2 headings, and naturally throughout (target 1.5–2.5% density)
3. Use secondary keywords naturally — never force them
4. Write for humans first, search engines second
5. Include specific, practical examples relevant to ${brief.siteContext.siteName}
6. Add a compelling CTA in the conclusion that drives direct bookings
7. Format with proper Markdown: ## for H2, ### for H3, **bold** for emphasis
8. Write the FAQ section in Q&A format, each answer 40–80 words
9. Do NOT use generic openers like "In this article, we will..." or "Are you looking for..."
10. Start with a hook that immediately addresses the reader's core need or pain point
11. Keep paragraphs short (3–4 sentences max) for readability

Return the complete article in Markdown format only. No preamble, no explanation.`;
}
```

```typescript
// src/ai/prompts/optimize.prompt.ts
import { SeoBrief } from '../../seo-brief/seo-brief.types';

export function buildOptimizePrompt(
  brief: SeoBrief,
  draft: string,
  issues: string[],
): string {
  return `You are an expert SEO editor specializing in vacation rental content.

Review and optimize the article draft below. Fix only the issues listed — do not rewrite sections that are already good.

FOCUS KEYWORD: ${brief.keyword}
TARGET WORD COUNT: ${brief.targetWordCount}
TONE: ${brief.tone}

ISSUES TO FIX:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

OPTIMIZATION CHECKLIST:
- Focus keyword appears in the first 100 words: required
- Focus keyword in at least one H2: required
- Keyword density between 1.5% and 2.5%: required
- Meta description is 150–160 characters: required
- No duplicate H2 headings: required
- All paragraphs under 4 sentences: required
- CTA present in conclusion: required
- Transition words used between sections: recommended
- Active voice used throughout: recommended

DRAFT TO OPTIMIZE:
${draft}

Return ONLY the optimized article in Markdown format. No explanation, no commentary.`;
}
```

```typescript
// src/ai/prompts/index.ts
export { buildOutlinePrompt } from './outline.prompt';
export { buildDraftPrompt } from './draft.prompt';
export { buildOptimizePrompt } from './optimize.prompt';
```

---

## 7. Content Analyzer (pre-optimize scoring)

```typescript
// src/content-analyzer/content-analyzer.service.ts
import { Injectable } from '@nestjs/common';

export interface ContentAnalysisResult {
  wordCount: number;
  keywordDensity: number;
  keywordInFirstParagraph: boolean;
  keywordInH2Count: number;
  h2Count: number;
  h3Count: number;
  avgParagraphLength: number;
  hasMetaDescription: boolean;
  metaDescriptionLength: number;
  hasCta: boolean;
  hasFaq: boolean;
  readabilityScore: number; // 0–100, Flesch-Kincaid approximation
  issues: string[];
  seoScore: number; // 0–100 composite
}

@Injectable()
export class ContentAnalyzerService {
  analyze(content: string, focusKeyword: string): ContentAnalysisResult {
    const issues: string[] = [];

    const wordCount = this.countWords(content);
    const keywordDensity = this.calcDensity(content, focusKeyword, wordCount);
    const keywordInFirstParagraph = this.checkFirstParagraph(content, focusKeyword);
    const keywordInH2Count = this.countKeywordInH2(content, focusKeyword);
    const h2Count = (content.match(/^## .+/gm) ?? []).length;
    const h3Count = (content.match(/^### .+/gm) ?? []).length;
    const avgParagraphLength = this.calcAvgParagraphLength(content);
    const hasCta = this.detectCta(content);
    const hasFaq = /##.*faq|##.*frequently asked/i.test(content);
    const readabilityScore = this.approximateReadability(content);

    // collect issues
    if (keywordDensity < 1.5)
      issues.push(`Keyword density too low (${keywordDensity.toFixed(2)}%) — target 1.5–2.5%`);
    if (keywordDensity > 2.5)
      issues.push(`Keyword density too high (${keywordDensity.toFixed(2)}%) — reduce to 2.5% max`);
    if (!keywordInFirstParagraph)
      issues.push('Focus keyword missing from first paragraph');
    if (keywordInH2Count === 0)
      issues.push('Focus keyword not found in any H2 heading');
    if (h2Count < 3)
      issues.push(`Only ${h2Count} H2 headings — add more structure`);
    if (avgParagraphLength > 4)
      issues.push(`Average paragraph length is ${avgParagraphLength.toFixed(1)} sentences — keep under 4`);
    if (!hasCta)
      issues.push('No call-to-action detected in conclusion');
    if (!hasFaq)
      issues.push('FAQ section missing');
    if (wordCount < 800)
      issues.push(`Word count too low (${wordCount}) — minimum 800 words`);

    const seoScore = this.calcSeoScore({
      keywordDensity,
      keywordInFirstParagraph,
      keywordInH2Count,
      h2Count,
      hasCta,
      hasFaq,
      wordCount,
      readabilityScore,
    });

    return {
      wordCount,
      keywordDensity,
      keywordInFirstParagraph,
      keywordInH2Count,
      h2Count,
      h3Count,
      avgParagraphLength,
      hasMetaDescription: false, // checked separately from outline JSON
      metaDescriptionLength: 0,
      hasCta,
      hasFaq,
      readabilityScore,
      issues,
      seoScore,
    };
  }

  private countWords(text: string): number {
    return text
      .replace(/```[\s\S]*?```/g, '') // strip code blocks
      .replace(/[#*`_\[\]()]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  private calcDensity(text: string, keyword: string, wordCount: number): number {
    if (wordCount === 0) return 0;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(escaped, 'gi')) ?? [];
    return (matches.length / wordCount) * 100;
  }

  private checkFirstParagraph(text: string, keyword: string): boolean {
    const firstParagraph = text.split('\n\n')[0] ?? '';
    return firstParagraph.toLowerCase().includes(keyword.toLowerCase());
  }

  private countKeywordInH2(text: string, keyword: string): number {
    const h2Lines = text.match(/^## .+/gm) ?? [];
    return h2Lines.filter((line) =>
      line.toLowerCase().includes(keyword.toLowerCase()),
    ).length;
  }

  private calcAvgParagraphLength(text: string): number {
    const paragraphs = text
      .split('\n\n')
      .filter((p) => p.trim() && !p.startsWith('#') && !p.startsWith('-'));
    if (paragraphs.length === 0) return 0;
    const totalSentences = paragraphs.reduce((sum, p) => {
      return sum + (p.match(/[.!?]+/g) ?? []).length;
    }, 0);
    return totalSentences / paragraphs.length;
  }

  private detectCta(text: string): boolean {
    return /book now|reserve|get started|contact us|learn more|start your|try free|sign up|direct booking/i.test(
      text,
    );
  }

  private approximateReadability(text: string): number {
    // simplified Flesch approximation — good enough for scoring
    const sentences = (text.match(/[.!?]+/g) ?? []).length || 1;
    const words = this.countWords(text) || 1;
    const syllables = text
      .toLowerCase()
      .replace(/[^a-z]/g, ' ')
      .split(/\s+/)
      .reduce((sum, word) => sum + Math.max(1, word.replace(/[^aeiou]/g, '').length), 0);

    const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  private calcSeoScore(factors: {
    keywordDensity: number;
    keywordInFirstParagraph: boolean;
    keywordInH2Count: number;
    h2Count: number;
    hasCta: boolean;
    hasFaq: boolean;
    wordCount: number;
    readabilityScore: number;
  }): number {
    let score = 0;

    // keyword density (20 pts)
    if (factors.keywordDensity >= 1.5 && factors.keywordDensity <= 2.5) score += 20;
    else if (factors.keywordDensity >= 1.0 && factors.keywordDensity <= 3.0) score += 10;

    // keyword in first paragraph (15 pts)
    if (factors.keywordInFirstParagraph) score += 15;

    // keyword in H2 (15 pts)
    if (factors.keywordInH2Count >= 2) score += 15;
    else if (factors.keywordInH2Count === 1) score += 8;

    // structure (15 pts)
    if (factors.h2Count >= 5) score += 15;
    else if (factors.h2Count >= 3) score += 8;

    // CTA (10 pts)
    if (factors.hasCta) score += 10;

    // FAQ (10 pts)
    if (factors.hasFaq) score += 10;

    // word count (10 pts)
    if (factors.wordCount >= 1500) score += 10;
    else if (factors.wordCount >= 800) score += 5;

    // readability (5 pts)
    if (factors.readabilityScore >= 60) score += 5;

    return score;
  }
}
```

```typescript
// src/content-analyzer/content-analyzer.module.ts
import { Module } from '@nestjs/common';
import { ContentAnalyzerService } from './content-analyzer.service';

@Module({
  providers: [ContentAnalyzerService],
  exports: [ContentAnalyzerService],
})
export class ContentAnalyzerModule {}
```

---

## 8. Content Generation Pipeline

```typescript
// src/content-generation/content-generation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SeoBriefBuilder } from '../seo-brief/seo-brief.builder';
import { ContentAnalyzerService } from '../content-analyzer/content-analyzer.service';
import {
  buildOutlinePrompt,
  buildDraftPrompt,
  buildOptimizePrompt,
} from '../ai/prompts';
import { AiStrategy } from '../ai/types/ai.types';

export interface GenerationResult {
  outline: Record<string, unknown>;
  draft: string;
  finalContent: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  seoScore: number;
  wordCount: number;
  totalCostUsd: number;
  totalDurationMs: number;
}

@Injectable()
export class ContentGenerationService {
  private readonly logger = new Logger(ContentGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly briefBuilder: SeoBriefBuilder,
    private readonly analyzer: ContentAnalyzerService,
  ) {}

  async generateForTask(taskId: string): Promise<GenerationResult> {
    const task = await this.prisma.contentTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { site: true },
    });

    const payload = task.payload as {
      keywordId: string;
      strategy?: AiStrategy;
    };

    const strategy: AiStrategy = payload.strategy ?? 'balanced';
    const { keywordId } = payload;

    this.logger.log(`[Task ${taskId}] Starting generation — strategy: ${strategy}`);

    // Step 1: build SEO brief
    const brief = await this.briefBuilder.build(keywordId, task.siteId);
    this.logger.log(`[Task ${taskId}] Brief built for keyword: "${brief.keyword}"`);

    // Step 2: generate outline
    const outlineResponse = await this.ai.complete(
      {
        messages: [
          {
            role: 'user',
            content: buildOutlinePrompt(brief),
          },
        ],
        responseFormat: 'json',
      },
      'outline',
      strategy,
      taskId,
    );

    let outline: Record<string, unknown>;
    try {
      outline = JSON.parse(outlineResponse.content);
    } catch {
      throw new Error(`Outline JSON parse failed: ${outlineResponse.content.slice(0, 200)}`);
    }
    this.logger.log(`[Task ${taskId}] Outline generated — ${outlineResponse.totalTokens} tokens`);

    // Step 3: generate draft
    const draftResponse = await this.ai.complete(
      {
        messages: [
          {
            role: 'user',
            content: buildDraftPrompt(brief, outline),
          },
        ],
        responseFormat: 'text',
      },
      'draft',
      strategy,
      taskId,
    );

    const draft = draftResponse.content;
    this.logger.log(`[Task ${taskId}] Draft generated — ${draftResponse.totalTokens} tokens`);

    // Step 4: analyze draft
    const analysis = this.analyzer.analyze(draft, brief.keyword);
    this.logger.log(
      `[Task ${taskId}] Analysis — SEO score: ${analysis.seoScore}, issues: ${analysis.issues.length}`,
    );

    // Step 5: optimize if score < 75 or issues exist
    let finalContent = draft;
    let optimizeTokens = 0;

    if (analysis.seoScore < 75 && analysis.issues.length > 0) {
      const optimizeResponse = await this.ai.complete(
        {
          messages: [
            {
              role: 'user',
              content: buildOptimizePrompt(brief, draft, analysis.issues),
            },
          ],
          responseFormat: 'text',
        },
        'optimize',
        strategy,
        taskId,
      );
      finalContent = optimizeResponse.content;
      optimizeTokens = optimizeResponse.totalTokens;
      this.logger.log(`[Task ${taskId}] Optimized — ${optimizeTokens} tokens`);
    } else {
      this.logger.log(`[Task ${taskId}] Score ${analysis.seoScore} >= 75 — skipping optimize step`);
    }

    // Step 6: final analysis for scoring
    const finalAnalysis = this.analyzer.analyze(finalContent, brief.keyword);

    // Step 7: persist to page record
    const metaTitle = (outline.metaTitle as string) ?? brief.keyword;
    const metaDescription = (outline.metaDescription as string) ?? '';
    const slug = (outline.slug as string) ?? brief.keyword.toLowerCase().replace(/\s+/g, '-');

    await this.prisma.page.upsert({
      where: { siteId_slug: { siteId: task.siteId, slug } },
      create: {
        siteId: task.siteId,
        keywordId,
        title: (outline.title as string) ?? brief.keyword,
        slug,
        metaTitle,
        metaDescription,
        focusKeyword: brief.keyword,
        secondaryKeywords: brief.secondaryKeywords,
        outline,
        rawDraft: draft,
        finalContent,
        wordCount: finalAnalysis.wordCount,
        seoScore: finalAnalysis.seoScore,
        readabilityScore: finalAnalysis.readabilityScore,
        status: 'DRAFT',
      },
      update: {
        rawDraft: draft,
        finalContent,
        outline,
        wordCount: finalAnalysis.wordCount,
        seoScore: finalAnalysis.seoScore,
        readabilityScore: finalAnalysis.readabilityScore,
        lastRefreshedAt: new Date(),
        status: 'DRAFT',
      },
    });

    const totalCostUsd =
      outlineResponse.costUsd + draftResponse.costUsd;
    const totalDurationMs =
      outlineResponse.durationMs + draftResponse.durationMs;

    this.logger.log(
      `[Task ${taskId}] Complete — score: ${finalAnalysis.seoScore}, cost: $${totalCostUsd.toFixed(4)}`,
    );

    return {
      outline,
      draft,
      finalContent,
      metaTitle,
      metaDescription,
      slug,
      seoScore: finalAnalysis.seoScore,
      wordCount: finalAnalysis.wordCount,
      totalCostUsd,
      totalDurationMs,
    };
  }
}
```

```typescript
// src/content-generation/content-generation.module.ts
import { Module } from '@nestjs/common';
import { ContentGenerationService } from './content-generation.service';
import { AiModule } from '../ai/ai.module';
import { SeoBriefModule } from '../seo-brief/seo-brief.module';
import { ContentAnalyzerModule } from '../content-analyzer/content-analyzer.module';

@Module({
  imports: [AiModule, SeoBriefModule, ContentAnalyzerModule],
  providers: [ContentGenerationService],
  exports: [ContentGenerationService],
})
export class ContentGenerationModule {}
```

---

## 9. Updated Content Tasks Processor (replaces Phase 1 stub)

```typescript
// src/content-tasks/content-tasks.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUES } from '../queue/queue.constants';
import { ContentTasksService } from './content-tasks.service';
import { ContentGenerationService } from '../content-generation/content-generation.service';

@Processor(QUEUES.CONTENT_GENERATION)
export class ContentTasksProcessor {
  private readonly logger = new Logger(ContentTasksProcessor.name);

  constructor(
    private readonly tasksService: ContentTasksService,
    private readonly contentGeneration: ContentGenerationService,
  ) {}

  @Process('process-content-task')
  async handle(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`[Queue] Picked up task ${taskId}`);

    const task = await this.tasksService.findOne(taskId);

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      this.logger.warn(`[Queue] Task ${taskId} already ${task.status} — skipping`);
      return;
    }

    if (task.attempts >= task.maxAttempts) {
      await this.tasksService.markFailed(taskId, 'Max retry attempts reached');
      return;
    }

    await this.tasksService.markProcessing(taskId);

    try {
      const result = await this.contentGeneration.generateForTask(taskId);
      await this.tasksService.markCompleted(taskId, {
        seoScore: result.seoScore,
        wordCount: result.wordCount,
        slug: result.slug,
        totalCostUsd: result.totalCostUsd,
        totalDurationMs: result.totalDurationMs,
      });
      this.logger.log(`[Queue] Task ${taskId} completed — score: ${result.seoScore}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.tasksService.markFailed(taskId, message);
      this.logger.error(`[Queue] Task ${taskId} failed: ${message}`);
      throw err; // re-throw so BullMQ retries
    }
  }
}
```

---

## 10. GSC & GA4 Ingestion Service


 Completion: GSC & GA4 Integration + Performance Evaluation

### 1. GSC Service (Complete Implementation)

```typescript
// src/analytics/gsc/gsc.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';

interface GSCMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

@Injectable()
export class GSCService {
  private readonly logger = new Logger(GSCService.name);
  private searchConsole: any;

  constructor(private prisma: PrismaService) {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });

    this.searchConsole = google.searchconsole({ version: 'v1', auth });
  }

  async fetchMetrics(
    siteUrl: string,
    pageUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<GSCMetrics> {
    try {
      const response = await this.searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ['query'],
          dimensionFilterGroups: [
            {
              filters: [
                {
                  dimension: 'page',
                  operator: 'equals',
                  expression: pageUrl,
                },
              ],
            },
          ],
          rowLimit: 100,
        },
      });

      const rows = response.data.rows || [];
      
      const totalMetrics = rows.reduce(
        (acc, row) => ({
          clicks: acc.clicks + row.clicks,
          impressions: acc.impressions + row.impressions,
          ctr: 0,
          position: 0,
        }),
        { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      );

      totalMetrics.ctr = totalMetrics.clicks / totalMetrics.impressions || 0;
      totalMetrics.position =
        rows.reduce((sum, row) => sum + row.position, 0) / rows.length || 0;

      return {
        ...totalMetrics,
        queries: rows.map((row) => ({
          query: row.keys[0],
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        })),
      };
    } catch (error) {
      this.logger.error(`GSC fetch failed for ${pageUrl}:`, error);
      throw error;
    }
  }

  async syncPageMetrics(pageId: string): Promise<void> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });

    if (!page) throw new Error('Page not found');

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const metrics = await this.fetchMetrics(
      page.site.domain,
      page.url,
      startDate,
      endDate,
    );

    await this.prisma.sEOMetric.create({
      data: {
        pageId: page.id,
        clicks: metrics.clicks,
        impressions: metrics.impressions,
        ctr: metrics.ctr,
        avgPosition: metrics.position,
        topQueries: metrics.queries.slice(0, 10),
        recordedAt: new Date(),
      },
    });

    this.logger.log(`Synced GSC metrics for page ${page.id}`);
  }
}
```

### 2. GA4 Service

```typescript
// src/analytics/ga4/ga4.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { PrismaService } from '../../prisma/prisma.service';

interface GA4Metrics {
  sessions: number;
  bounceRate: number;
  avgSessionDuration: number;
  conversions: number;
  conversionRate: number;
}

@Injectable()
export class GA4Service {
  private readonly logger = new Logger(GA4Service.name);
  private analyticsDataClient: BetaAnalyticsDataClient;

  constructor(private prisma: PrismaService) {
    this.analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
    });
  }

  async fetchMetrics(
    propertyId: string,
    pageUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<GA4Metrics> {
    try {
      const [response] = await this.analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'conversions' },
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'pagePath',
            stringFilter: {
              matchType: 'EXACT',
              value: new URL(pageUrl).pathname,
            },
          },
        },
      });

      const row = response.rows?.[0];
      if (!row) {
        return {
          sessions: 0,
          bounceRate: 0,
          avgSessionDuration: 0,
          conversions: 0,
          conversionRate: 0,
        };
      }

      const sessions = parseFloat(row.metricValues[0].value);
      const conversions = parseFloat(row.metricValues[3].value);

      return {
        sessions,
        bounceRate: parseFloat(row.metricValues[1].value),
        avgSessionDuration: parseFloat(row.metricValues[2].value),
        conversions,
        conversionRate: sessions > 0 ? conversions / sessions : 0,
      };
    } catch (error) {
      this.logger.error(`GA4 fetch failed for ${pageUrl}:`, error);
      throw error;
    }
  }

  async syncPageMetrics(pageId: string): Promise<void> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { site: true },
    });

    if (!page || !page.site.ga4PropertyId) {
      throw new Error('Page or GA4 property not found');
    }

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const metrics = await this.fetchMetrics(
      page.site.ga4PropertyId,
      page.url,
      startDate,
      endDate,
    );

    await this.prisma.sEOMetric.updateMany({
      where: {
        pageId: page.id,
        recordedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      data: {
        sessions: metrics.sessions,
        bounceRate: metrics.bounceRate,
        avgSessionDuration: metrics.avgSessionDuration,
        conversions: metrics.conversions,
      },
    });

    this.logger.log(`Synced GA4 metrics for page ${page.id}`);
  }
}
```

### 3. Performance Evaluator

```typescript
// src/analytics/performance/performance-evaluator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface PerformanceScore {
  overall: number;
  traffic: number;
  engagement: number;
  conversion: number;
  seo: number;
  recommendations: string[];
}

@Injectable()
export class PerformanceEvaluatorService {
  private readonly logger = new Logger(PerformanceEvaluatorService.name);

  constructor(private prisma: PrismaService) {}

  async evaluatePage(pageId: string): Promise<PerformanceScore> {
    const metrics = await this.prisma.sEOMetric.findMany({
      where: { pageId },
      orderBy: { recordedAt: 'desc' },
      take: 30,
    });

    if (metrics.length === 0) {
      return {
        overall: 0,
        traffic: 0,
        engagement: 0,
        conversion: 0,
        seo: 0,
        recommendations: ['No data available yet'],
      };
    }

    const latest = metrics[0];
    const previous = metrics[7] || metrics[metrics.length - 1];

    const scores = {
      traffic: this.calculateTrafficScore(latest, previous),
      engagement: this.calculateEngagementScore(latest),
      conversion: this.calculateConversionScore(latest),
      seo: this.calculateSEOScore(latest, previous),
    };

    const overall =
      (scores.traffic * 0.3 +
        scores.engagement * 0.25 +
        scores.conversion * 0.25 +
        scores.seo * 0.2) /
      100;

    const recommendations = this.generateRecommendations(scores, latest, previous);

    return {
      overall: Math.round(overall * 100),
      ...scores,
      recommendations,
    };
  }

  private calculateTrafficScore(latest: any, previous: any): number {
    const clickGrowth = this.calculateGrowth(latest.clicks, previous.clicks);
    const impressionGrowth = this.calculateGrowth(
      latest.impressions,
      previous.impressions,
    );

    let score = 50;
    if (clickGrowth > 20) score += 30;
    else if (clickGrowth > 10) score += 20;
    else if (clickGrowth > 0) score += 10;

    if (impressionGrowth > 20) score += 20;
    else if (impressionGrowth > 10) score += 10;

    return Math.min(100, score);
  }

  private calculateEngagementScore(latest: any): number {
    let score = 0;

    if (latest.bounceRate < 40) score += 40;
    else if (latest.bounceRate < 60) score += 25;
    else if (latest.bounceRate < 80) score += 10;

    if (latest.avgSessionDuration > 180) score += 30;
    else if (latest.avgSessionDuration > 120) score += 20;
    else if (latest.avgSessionDuration > 60) score += 10;

    if (latest.ctr > 0.05) score += 30;
    else if (latest.ctr > 0.03) score += 20;
    else if (latest.ctr > 0.01) score += 10;

    return Math.min(100, score);
  }

  private calculateConversionScore(latest: any): number {
    if (!latest.conversions) return 0;

    const conversionRate = latest.conversions / (latest.sessions || 1);

    if (conversionRate > 0.05) return 100;
    if (conversionRate > 0.03) return 80;
    if (conversionRate > 0.02) return 60;
    if (conversionRate > 0.01) return 40;
    return 20;
  }

  private calculateSEOScore(latest: any, previous: any): number {
    let score = 0;

    if (latest.avgPosition < 5) score += 40;
    else if (latest.avgPosition < 10) score += 30;
    else if (latest.avgPosition < 20) score += 20;
    else if (latest.avgPosition < 50) score += 10;

    const positionImprovement = previous.avgPosition - latest.avgPosition;
    if (positionImprovement > 10) score += 30;
    else if (positionImprovement > 5) score += 20;
    else if (positionImprovement > 0) score += 10;

    if (latest.ctr > 0.05) score += 30;
    else if (latest.ctr > 0.03) score += 20;
    else if (latest.ctr > 0.01) score += 10;

    return Math.min(100, score);
  }

  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  private generateRecommendations(
    scores: any,
    latest: any,
    previous: any,
  ): string[] {
    const recommendations: string[] = [];

    if (scores.traffic < 50) {
      recommendations.push(
        'Traffic is low. Consider improving keyword targeting and internal linking.',
      );
    }

    if (latest.avgPosition > 20) {
      recommendations.push(
        'Average position is low. Focus on content quality and backlink building.',
      );
    }

    if (latest.bounceRate > 70) {
      recommendations.push(
        'High bounce rate detected. Improve content relevance and page load speed.',
      );
    }

    if (latest.ctr < 0.02) {
      recommendations.push(
        'Low CTR. Optimize title tags and meta descriptions to be more compelling.',
      );
    }

    if (scores.conversion < 30 && latest.sessions > 100) {
      recommendations.push(
        'Low conversion rate despite traffic. Review CTA placement and user journey.',
      );
    }

    if (latest.avgSessionDuration < 60) {
      recommendations.push(
        'Short session duration. Add more engaging content and internal links.',
      );
    }

    const clickGrowth = this.calculateGrowth(latest.clicks, previous.clicks);
    if (clickGrowth < -10) {
      recommendations.push(
        'Traffic declining. Audit for technical SEO issues and content freshness.',
      );
    }

    return recommendations.length > 0
      ? recommendations
      : ['Performance is good. Continue monitoring and optimizing.'];
  }

  async evaluateSite(siteId: string): Promise<any> {
    const pages = await this.prisma.page.findMany({
      where: { siteId, status: 'PUBLISHED' },
    });

    const evaluations = await Promise.all(
      pages.map((page) => this.evaluatePage(page.id)),
    );

    const avgScore =
      evaluations.reduce((sum, e) => sum + e.overall, 0) / evaluations.length;

    return {
      siteId,
      overallScore: Math.round(avgScore),
      totalPages: pages.length,
      topPerformers: evaluations
        .map((e, i) => ({ pageId: pages[i].id, score: e.overall }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
      needsAttention: evaluations
        .map((e, i) => ({ pageId: pages[i].id, score: e.overall }))
        .filter((p) => p.score < 40)
        .sort((a, b) => a.score - b.score),
    };
  }
}
```

### 4. Analytics Module

```typescript
// src/analytics/analytics.module.ts
import { Module } from '@nestjs/common';
import { GSCService } from './gsc/gsc.service';
import { GA4Service } from './ga4/ga4.service';
import { PerformanceEvaluatorService } from './performance/performance-evaluator.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [GSCService, GA4Service, PerformanceEvaluatorService],
  controllers: [AnalyticsController],
  exports: [GSCService, GA4Service, PerformanceEvaluatorService],
})
export class AnalyticsModule {}
```

### 5. Analytics Controller

```typescript
// src/analytics/analytics.controller.ts
import { Controller, Get, Param, Post } from '@nestjs/common';
import { GSCService } from './gsc/gsc.service';
import { GA4Service } from './ga4/ga4.service';
import { PerformanceEvaluatorService } from './performance/performance-evaluator.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private gscService: GSCService,
    private ga4Service: GA4Service,
    private performanceEvaluator: PerformanceEvaluatorService,
  ) {}

  @Post('sync/gsc/:pageId')
  async syncGSC(@Param('pageId') pageId: string) {
    await this.gscService.syncPageMetrics(pageId);
    return { message: 'GSC metrics synced successfully' };
  }

  @Post('sync/ga4/:pageId')
  async syncGA4(@Param('pageId') pageId: string) {
    await this.ga4Service.syncPageMetrics(pageId);
    return { message: 'GA4 metrics synced successfully' };
  }

  @Get('performance/page/:pageId')
  async getPagePerformance(@Param('pageId') pageId: string) {
    return this.performanceEvaluator.evaluatePage(pageId);
  }

  @Get('performance/site/:siteId')
  async getSitePerformance(@Param('siteId') siteId: string) {
    return this.performanceEvaluator.evaluateSite(siteId);
  }
}
```

### 6. Scheduler for Automated Sync

```typescript
// src/scheduler/analytics-sync.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GSCService } from '../analytics/gsc/gsc.service';
import { GA4Service } from '../analytics/ga4/ga4.service';

@Injectable()
export class AnalyticsSyncScheduler {
  private readonly logger = new Logger(AnalyticsSyncScheduler.name);

  constructor(
    private prisma: PrismaService,
    private gscService: GSCService,
    private ga4Service: GA4Service,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async syncAllMetrics() {
    this.logger.log('Starting daily analytics sync...');

    const pages = await this.prisma.page.findMany({
      where: { status: 'PUBLISHED' },
    });

    for (const page of pages) {
      try {
        await this.gscService.syncPageMetrics(page.id);
        await this.ga4Service.syncPageMetrics(page.id);
        this.logger.log(`Synced metrics for page ${page.id}`);
      } catch (error) {
        this.logger.error(`Failed to sync page ${page.id}:`, error);
      }
    }

    this.logger.log('Daily analytics sync completed');
  }
}
```

### 7. Update App Module

```typescript
// src/app.module.ts - Add these imports
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsModule } from './analytics/analytics.module';
import { AnalyticsSyncScheduler } from './scheduler/analytics-sync.scheduler';

@Module({
  imports: [
    // ... existing imports
    ScheduleModule.forRoot(),
    AnalyticsModule,
  ],
  providers: [AnalyticsSyncScheduler],
})
export class AppModule {}
```

### 8. Additional Packages

```bash
npm install @google-analytics/data googleapis @nestjs/schedule
```

### 9. Environment Variables (Add to .env)

```env
# Google Analytics
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

