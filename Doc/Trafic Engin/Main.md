# Nestino SEO & Traffic Engine: Complete System Documentation

**Last Updated:** 1405/01/27 (2026/04/16)  
**System Version:** 1.0.0  
**Architecture:** Decoupled Headless (Next.js 14 + NestJS + PostgreSQL)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & Technology Stack](#2-architecture--technology-stack)
3. [AI Strategy & Cost Analysis](#3-ai-strategy--cost-analysis)
4. [SEO Tools Integration](#4-seo-tools-integration)
5. [Database Schema (Complete)](#5-database-schema-complete)
6. [Phase Implementation Roadmap](#6-phase-implementation-roadmap)
7. [Queue Architecture (BullMQ)](#7-queue-architecture-bullmq)
8. [Cost Breakdown & ROI Projections](#8-cost-breakdown--roi-projections)
9. [Security & Compliance](#9-security--compliance)
10. [Monitoring & Analytics](#10-monitoring--analytics)

---

## 1. System Overview

### 1.1 Mission Statement
The Nestino SEO & Traffic Engine is a fully autonomous, AI-powered content generation and distribution system designed to maximize direct bookings for short-term rental properties (villas, vacation homes) by eliminating dependency on OTA platforms like Airbnb and Booking.com.

### 1.2 Core Capabilities
- **Automated SEO Content Generation:** 10 high-quality, SEO-optimized blog posts per day per property
- **Multi-Language Support:** Automatic translation to 5+ languages with proper hreflang implementation
- **AI Visual Generation:** Automatic header images and social thumbnails using DALL-E 3 / Midjourney
- **Performance Monitoring:** Real-time GSC/GA4 analytics ingestion and automated content optimization
- **Social Syndication:** Automatic distribution to Pinterest, Instagram, Facebook, Twitter/X
- **Network Aggregation:** Regional hub creation for cross-property PageRank distribution
- **Instant Indexing:** IndexNow protocol + Google Sitemap ping for immediate search engine discovery

### 1.3 Target Market
- **Primary:** Bali villa owners (initial launch market)
- **Secondary:** Global vacation rental properties in high-tourism regions
- **Business Model:** SaaS subscription ($99-299/month per property)

---

## 2. Architecture & Technology Stack

### 2.1 System Architecture Diagram

┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                          │
│  Next.js 14 (App Router) + Wildcard Domain Routing + ISR   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend Layer                           │
│  NestJS + Prisma ORM + PostgreSQL + Redis + BullMQ         │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
        ┌───────────┐  ┌───────────┐  ┌───────────┐
        │ AI Layer  │  │ SEO Tools │  │  Storage  │
        │ Claude    │  │ Ahrefs    │  │ R2/S3     │
        │ Gemini    │  │ Surfer    │  │ WebP      │
        │ DALL-E 3  │  │ GSC/GA4   │  │ CDN       │
        └───────────┘  └───────────┘  └───────────┘


### 2.2 Technology Stack

**Frontend:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Incremental Static Regeneration (ISR)

**Backend:**
- NestJS (Node.js framework)
- Prisma ORM
- PostgreSQL 15+
- Redis (caching + session management)
- BullMQ (job queue system)

**AI & ML:**
- Gemini 1.5 Flash (outline generation)
- Claude Haiku 3.5 / Sonnet 4 (content writing)
- DALL-E 3 / Midjourney (image generation)
- Vercel AI SDK (unified AI interface)

**SEO Tools:**
- Ahrefs API (keyword research)
- Surfer SEO API (content optimization)
- Google Search Console API (performance tracking)
- Google Analytics 4 API (user behavior)

**Infrastructure:**
- Cloudflare R2 / AWS S3 (image storage)
- Cloudflare CDN (global content delivery)
- Docker + Docker Compose (containerization)
- GitHub Actions (CI/CD)

---

## 3. AI Strategy & Cost Analysis

### 3.1 AI Model Selection Matrix

| Use Case | Primary Model | Fallback Model | Cost per 1M Tokens | Rationale |
|----------|--------------|----------------|-------------------|-----------|
| Content Outline | Gemini 1.5 Flash | GPT-4o mini | $0.075 input / $0.30 output | Fast, cheap, structured output |
| Content Writing | Claude Haiku 3.5 | Claude Sonnet 4 | $0.80 input / $4.00 output | Best quality/cost ratio |
| Content Humanization | Claude Sonnet 4 | GPT-4o | $3.00 input / $15.00 output | Premium quality for final polish |
| Image Prompts | GPT-4o mini | Gemini Flash | $0.15 input / $0.60 output | Creative, detailed prompts |
| Social Captions | Gemini Flash | Claude Haiku | $0.075 input / $0.30 output | Platform-specific tone |

### 3.2 Monthly Cost Projections (300 articles/month)

**Scenario 1: Budget Tier (Gemini Flash + Claude Haiku)**
- Outline Generation: 300 × $0.02 = $6
- Content Writing: 300 × $0.15 = $45
- Humanization: 300 × $0.05 = $15
- Image Prompts: 300 × $0.01 = $3
- Social Captions: 300 × $0.01 = $3
- **Total AI Cost: $72/month**

**Scenario 2: Premium Tier (GPT-4o mini + Claude Sonnet 4)**
- Outline Generation: 300 × $0.03 = $9
- Content Writing: 300 × $0.40 = $120
- Humanization: 300 × $0.10 = $30
- Image Prompts: 300 × $0.02 = $6
- Social Captions: 300 × $0.02 = $6
- **Total AI Cost: $171/month**

### 3.3 Image Generation Costs

| Provider | Cost per Image | Quality | Speed | Use Case |
|----------|---------------|---------|-------|----------|
| DALL-E 3 (1024×1024) | $0.040 | High | Fast | Primary header images |
| Midjourney (via GoAPI) | $0.08-0.12 | Very High | Medium | Premium properties |
| Pexels/Unsplash API | Free | Medium | Instant | Fallback/low-priority |

**Monthly Image Cost (300 articles):**
- 70% DALL-E 3: 210 × $0.04 = $8.40
- 20% Midjourney: 60 × $0.10 = $6.00
- 10% Pexels: 30 × $0 = $0
- **Total: $14.40/month**

---

## 4. SEO Tools Integration

### 4.1 Required Tool Subscriptions

| Tool | Monthly Cost | Primary Use | API Limits |
|------|-------------|-------------|------------|
| Ahrefs Lite | $99 | Keyword research, competitor analysis | 500 requests/day |
| Surfer SEO Basic | $89 | Content optimization, SERP analysis | 30 articles/month |
| Google Search Console | Free | Performance tracking, indexing status | 25,000 requests/day |
| Google Analytics 4 | Free | User behavior, conversion tracking | Unlimited |
| IndexNow | Free | Instant indexing (Bing, Yandex) | 10,000 URLs/request |

**Total Monthly Tool Cost: $188**

### 4.2 SEO Workflow Integration

1. Keyword Research (Ahrefs API)
   ↓
2. SERP Analysis (Surfer SEO API)
   ↓
3. Content Brief Generation (AI + SEO data)
   ↓
4. Content Writing (Claude/Gemini)
   ↓
5. On-Page Optimization (Surfer SEO scoring)
   ↓
6. Human Review Layer (optional)
   ↓
7. Publication + Instant Indexing (IndexNow)
   ↓
8. Performance Monitoring (GSC/GA4)


---

## 5. Database Schema (Complete)

### 5.1 Core Tables

```prisma
// Prisma Schema for Nestino Traffic Engine
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// PHASE 1: Foundation Tables
// ============================================

model Site {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  domain          String   @unique @db.VarChar(255)
  propertyName    String   @map("property_name") @db.VarChar(255)
  region          String   @db.VarChar(100)
  primaryLanguage String   @default("en") @map("primary_language") @db.VarChar(10)
  gscPropertyUrl  String?  @map("gsc_property_url") @db.VarChar(500)
  ga4PropertyId   String?  @map("ga4_property_id") @db.VarChar(50)
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  
  keywords        Keyword[]
  pages           Page[]
  
  @@map("sites")
}

model Keyword {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  siteId          String   @map("site_id") @db.Uuid
  keyword         String   @db.VarChar(255)
  searchVolume    Int      @map("search_volume")
  difficulty      Int      // 0-100 (Ahrefs KD)
  cpc             Float?   @db.Decimal(10, 2)
  intent          String   @db.VarChar(50) // informational, commercial, transactional
  priority        Int      @default(5) // 1-10
  status          String   @default("pending") @db.VarChar(50) // pending, in_progress, published
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  
  site            Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  pages           Page[]
  
  @@unique([siteId, keyword])
  @@map("keywords")
}

model Page {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  siteId          String   @map("site_id") @db.Uuid
  keywordId       String?  @map("keyword_id") @db.Uuid
  slug            String   @db.VarChar(255)
  metaTitle       String   @map("meta_title") @db.VarChar(255)
  metaDescription String   @map("meta_description") @db.VarChar(500)
  content         String   @db.Text
  wordCount       Int      @map("word_count")
  language        String   @default("en") @db.VarChar(10)
  status          String   @default("draft") @db.VarChar(50) // draft, published, archived
  publishedAt     DateTime? @map("published_at") @db.Timestamptz
  lastModifiedAt  DateTime @default(now()) @map("last_modified_at") @db.Timestamptz
  
  site            Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  keyword         Keyword? @relation(fields: [keywordId], references: [id], onDelete: SetNull)
  
  contentTasks    ContentTask[]
  seoMetrics      SeoMetric[]
  analyticsLogs   PageAnalyticsLog[]
  internalLinks   InternalLink[] @relation("SourcePage")
  linkedFrom      InternalLink[] @relation("TargetPage")
  images          ImageAsset[]
  syndications    SyndicationLog[]
  indexingLogs    IndexingLog[]
  languageVariants LanguageVariant[]
  hubLinks        HubVillaLink[]
  
  @@unique([siteId, slug])
  @@map("pages")
}

model ContentTask {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  taskType        String   @map("task_type") @db.VarChar(50) // outline, writing, optimization, humanization
  aiModel         String   @map("ai_model") @db.VarChar(50)
  promptUsed      String   @map("prompt_used") @db.Text
  outputTokens    Int      @map("output_tokens")
  costUsd         Float    @map("cost_usd") @db.Decimal(10, 4)
  status          String   @default("pending") @db.VarChar(50) // pending, completed, failed
  errorMessage    String?  @map("error_message") @db.Text
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  completedAt     DateTime? @map("completed_at") @db.Timestamptz
  
  page            Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  @@map("content_tasks")
}

model SeoMetric {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  date            DateTime @db.Date
  impressions     Int      @default(0)
  clicks          Int      @default(0)
  ctr             Float    @default(0) @db.Decimal(5, 4)
  avgPosition     Float    @map("avg_position") @db.Decimal(5, 2)
  surferScore     Int?     @map("surfer_score") // 0-100
  
  page            Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  @@unique([pageId, date])
  @@map("seo_metrics")
}

// ============================================
// PHASE 2: Performance Evaluation Tables
// ============================================

model PageAnalyticsLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  date            DateTime @db.Date
  sessions        Int      @default(0)
  bounceRate      Float    @map("bounce_rate") @db.Decimal(5, 4)
  avgTimeOnPage   Int      @map("avg_time_on_page") // seconds
  conversions     Int      @default(0)
  
  page            Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  @@unique([pageId, date])
  @@map("page_analytics_logs")
}

model InternalLink {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sourcePageId    String   @map("source_page_id") @db.Uuid
  targetPageId    String   @map("target_page_id") @db.Uuid
  anchorText      String   @map("anchor_text") @db.VarChar(255)
  contextSnippet  String?  @map("context_snippet") @db.Text
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  
  sourcePage      Page     @relation("SourcePage", fields: [sourcePageId], references: [id], onDelete: Cascade)
  targetPage      Page     @relation("TargetPage", fields: [targetPageId], references: [id], onDelete: Cascade)
  
  @@unique([sourcePageId, targetPageId])
  @@map("internal_links")
}

model MetaAbTest {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  variantType     String   @map("variant_type") @db.VarChar(50) // title, description
  variantA        String   @map("variant_a") @db.VarChar(500)
  variantB        String   @map("variant_b") @db.VarChar(500)
  impressionsA    Int      @default(0) @map("impressions_a")
  impressionsB    Int      @default(0) @map("impressions_b")
  clicksA         Int      @default(0) @map("clicks_a")
  clicksB         Int      @default(0) @map("clicks_b")
  winnerVariant   String?  @map("winner_variant") @db.VarChar(1) // A or B
  zScore          Float?   @map("z_score") @db.Decimal(10, 4)
  isActive        Boolean  @default(true) @map("is_active")
  startedAt       DateTime @default(now()) @map("started_at") @db.Timestamptz
  completedAt     DateTime? @map("completed_at") @db.Timestamptz
  
  @@map("meta_ab_tests")
}

// ============================================
// PHASE 3: AI Discovery & Trends Tables
// ============================================

model TrendAlert {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  region          String   @db.VarChar(100)
  keyword         String   @db.VarChar(255)
  source          String   @db.VarChar(50) // google_trends, twitter, reddit
  momentumScore   Float    @map("momentum_score") @db.Decimal(10, 4)
  searchVolume    Int      @map("search_volume")
  isProcessed     Boolean  @default(false) @map("is_processed")
  detectedAt      DateTime @default(now()) @map("detected_at") @db.Timestamptz
  
  @@unique([region, keyword, source])
  @@map("trend_alerts")
}

model LanguageVariant {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  originalPageId  String   @map("original_page_id") @db.Uuid
  language        String   @db.VarChar(10)
  translatedTitle String   @map("translated_title") @db.VarChar(255)
  translatedContent String @map("translated_content") @db.Text
  translationProvider String @map("translation_provider") @db.VarChar(50) // deepl, openai
  translationCost Float    @map("translation_cost") @db.Decimal(10, 4)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  
  originalPage    Page     @relation(fields: [originalPageId], references: [id], onDelete: Cascade)
  
  @@unique([originalPageId, language])
  @@map("language_variants")
}

model AiCitationLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  aiEngine        String   @map("ai_engine") @db.VarChar(50) // perplexity, chatgpt, gemini
  query           String   @db.Text
  wasCited        Boolean  @map("was_cited")
  citationText    String?  @map("citation_text") @db.Text
  similarityScore Float?   @map("similarity_score") @db.Decimal(5, 4)
  checkedAt       DateTime @default(now()) @map("checked_at") @db.Timestamptz
  
  @@map("ai_citation_logs")
}

// ============================================
// PHASE 4: Scale & Autopilot Tables
// ============================================

model ImageAsset {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  provider        String   @db.VarChar(50) // dalle-3, midjourney, pexels, unsplash
  promptUsed      String   @map("prompt_used") @db.Text
  storageUrl      String   @map("storage_url") @db.VarChar(500)
  altText         String   @map("alt_text") @db.VarChar(255)
  fileSize        Int      @map("file_size") // bytes
  qualityScore    Float?   @map("quality_score") @db.Decimal(5, 2) // 0-100
  generationCost  Float?   @map("generation_cost") @db.Decimal(10, 4)
  isApproved      Boolean  @default(false) @map("is_approved")
  rejectionReason String?  @map("rejection_reason") @db.Text
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  
  page            Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  @@map("image_assets")
}

model SyndicationLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  platform        String   @db.VarChar(50) // pinterest, facebook, instagram, twitter
  externalPostId  String?  @map("external_post_id") @db.VarChar(255)
  externalUrl     String?  @map("external_url") @db.VarChar(500)
  caption         String?  @db.Text
  hashtags        String[] @default([])
  status          String   @default("pending") @db.VarChar(50) // pending, published, failed
  errorMessage    String?  @map("error_message") @db.Text
  engagementStats Json?    @map("engagement_stats") // {likes, shares, clicks, impressions}
  scheduledFor    DateTime? @map("scheduled_for") @db.Timestamptz
  publishedAt     DateTime? @map("published_at") @db.Timestamptz
  
  page            Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  @@unique([pageId, platform])
  @@map("syndication_logs")
}

model IndexingLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  searchEngine    String   @map("search_engine") @db.VarChar(50) // indexnow, google-sitemap, bing-webmaster
  priority        Int      @default(5) @map("priority") // 1-10
  responseCode    Int      @map("response_code")
  retryCount      Int      @default(0) @map("retry_count")
  indexStatus     String?  @map("index_status") @db.VarChar(50) // pending, indexed, excluded, error
  indexedAt       DateTime? @map("indexed_at") @db.Timestamptz
  pingedAt        DateTime @default(now()) @map("pinged_at") @db.Timestamptz
  
  page            Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  @@map("indexing_logs")
}

model AggregatorHub {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  region          String   @db.VarChar(100) // bali, greece, southeast-asia
  hubUrl          String   @unique @map("hub_url") @db.VarChar(500)
  hubTitle        String   @map("hub_title") @db.VarChar(255)
  qualityScore    Float    @default(0) @map("quality_score") @db.Decimal(5, 2)
  linkedVillaCount Int     @default(0) @map("linked_villa_count")
  lastLinkAddedAt DateTime? @map("last_link_added_at") @db.Timestamptz
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  
  links           HubVillaLink[]
  
  @@map("aggregator_hubs")
}

model HubVillaLink {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  hubId           String   @map("hub_id") @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  anchorText      String   @map("anchor_text") @db.VarChar(255)
  semanticRelevance Float  @map("semantic_relevance") @db.Decimal(5, 4) // 0-1
  addedAt         DateTime @default(now()) @map("added_at") @db.Timestamptz
  
  hub             AggregatorHub @relation(fields: [hubId], references: [id], onDelete: Cascade)
  page            Page          @relation(fields: [pageId], references: [id], onDelete: Cascade)
  
  @@unique([hubId, pageId])
  @@map("hub_villa_links")
}

// ============================================
// System Monitoring Tables
// ============================================

model SystemHealthLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  component       String   @db.VarChar(100) // ai-service, queue-worker, indexing-service
  status          String   @db.VarChar(50) // healthy, degraded, down
  errorCount      Int      @default(0) @map("error_count")
  avgResponseTime Int?     @map("avg_response_time") // milliseconds
  checkedAt       DateTime @default(now()) @map("checked_at") @db.Timestamptz
  
  @@map("system_health_logs")
}

model CostTracker {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  date            DateTime @db.Date
  category        String   @db.VarChar(50) // ai-tokens, image-generation, seo-tools, storage
  provider        String   @db.VarChar(50)
  amount          Float    @db.Decimal(10, 4)
  currency        String   @default("USD") @db.VarChar(3)
  
  @@unique([date, category, provider])
  @@map("cost_tracker")
}
```

---

## 6. Phase Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Establish database schema, NestJS modules, and basic AI integration.

**Deliverables:**
- ✅ PostgreSQL database with all tables
- ✅ Prisma schema and migrations
- ✅ NestJS modules: `SitesModule`, `KeywordsModule`, `PagesModule`, `ContentModule`
- ✅ Basic AI service with Gemini Flash + Claude Haiku integration
- ✅ Ahrefs API integration for keyword research

**Success Metrics:**
- Database can handle 10,000+ pages without performance degradation
- AI service can generate 1 article in <60 seconds
- Keyword research returns 50+ relevant keywords per property

---

### Phase 2: Performance Evaluation & Optimization (Weeks 3-5)
**Goal:** Automate SEO performance monitoring and content optimization.

**Deliverables:**
- ✅ GSC/GA4 API integration with daily sync
- ✅ Performance evaluation algorithms (traffic drop detection, CTR analysis)
- ✅ AI Critic service for content rewriting
- ✅ Meta A/B testing system with Z-score validation
- ✅ Internal linking engine with PageRank distribution
- ✅ BullMQ queues: `analytics-sync-queue`, `evaluation-queue`, `ab-test-queue`, `internal-link-queue`

**Success Metrics:**
- 95% of traffic drops detected within 24 hours
- A/B tests reach statistical significance in <14 days
- Internal linking increases average page authority by 15%

---

### Phase 3: AI Discovery & Trends (Weeks 6-8)
**Goal:** Identify emerging trends and expand to multiple languages.

**Deliverables:**
- ✅ Trend discovery system (Google Trends, Twitter, Reddit APIs)
- ✅ Momentum score calculation for trend prioritization
- ✅ GEO (Generative Engine Optimization) implementation
- ✅ Multi-language translation with DeepL/OpenAI
- ✅ Hreflang tag management
- ✅ AI citation tracking (Perplexity, ChatGPT monitoring)
- ✅ BullMQ queues: `trend-ingestion-queue`, `translation-queue`, `ai-citation-check-queue`, `geo-schema-queue`

**Success Metrics:**
- Detect 10+ high-momentum trends per week
- Translate content to 5 languages with 95% accuracy
- 20% of content cited by AI engines within 90 days

---

### Phase 4: Scale & Autopilot (Weeks 9-12)
**Goal:** Full automation with visual generation, instant indexing, and social syndication.

**Deliverables:**
- ✅ AI image generation (DALL-E 3 + Midjourney + Pexels fallback)
- ✅ Image quality validation system
- ✅ WebP compression and R2/S3 upload pipeline
- ✅ IndexNow + Google Sitemap ping integration
- ✅ Retry logic with exponential backoff
- ✅ Social media syndication (Pinterest, Instagram, Facebook, Twitter)
- ✅ Platform-specific content optimization
- ✅ Engagement tracking and ROI calculation
- ✅ Network aggregation with hub quality scoring
- ✅ Link velocity controller and penalty detection
- ✅ BullMQ queues: `visual-generation-queue`, `image-quality-validation-queue`, `indexing-queue`, `social-syndication-queue`, `engagement-tracking-queue`, `hub-quality-evaluation-queue`, `penalty-detection-queue`

**Success Metrics:**
- 100% of articles have AI-generated header images
- 90% of pages indexed within 48 hours
- Social syndication drives 25% of total traffic
- Network hubs increase villa page authority by 30%

---

## 7. Queue Architecture (BullMQ)

### 7.1 Queue Configuration

```typescript
// nestjs/src/queues/queue.module.ts
import { BullModule } from '@nestjs