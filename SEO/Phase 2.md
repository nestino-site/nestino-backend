# Nestino Traffic Engine: Phase 2 Documentation (Optimization & Automation)

**Document Date:** 1405/01/21 (2026/04/10)
**Module:** Traffic Engine (NestJS Backend)
**Focus:** Data-driven content refreshes, Internal Linking, Meta-Optimization, and the "AI Critic" Loop.

---

## 1. Phase 2 Objectives
While Phase 1 focused on programmatic SEO generation, Phase 2 turns the system into an autonomous optimization engine. The primary goals are:
1.  **Analytics Ingestion:** Sync daily metrics from Google Search Console (GSC) and Google Analytics 4 (GA4).
2.  **Anomaly & Decay Detection:** Automatically detect pages losing traffic or underperforming their expected Click-Through Rate (CTR).
3.  **Autonomous Content Refreshes (AI Critic):** Rewrite outdated content or add depth to pages ranking on page 2.
4.  **Dynamic Meta-Optimization:** Auto-rotate title tags and meta descriptions to maximize CTR.
5.  **Smart Internal Linking:** Programmatically link pages to distribute link equity (PageRank) to high-converting villa booking pages.

---

## 2. Database Schema Extensions (Prisma)

To support time-series data, A/B testing, and internal link graphing, we must extend the Phase 1 Prisma schema.

```prisma
// Track daily metrics per page to detect decay
model PageAnalyticsLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  date            DateTime @db.Date
  impressions     Int      @default(0)
  clicks          Int      @default(0)
  position        Float    @default(0.0)
  ctr             Float    @default(0.0)
  bounceRate      Float?   @map("bounce_rate")
  conversions     Int      @default(0)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  page            Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@unique([pageId, date])
  @@index([date])
}

// Track A/B tests for Meta Titles/Descriptions
model MetaExperiment {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String    @map("page_id") @db.Uuid
  variantA_Title  String    @map("variant_a_title") @db.VarChar(255)
  variantA_Desc   String    @map("variant_a_desc") @db.Text
  variantB_Title  String    @map("variant_b_title") @db.VarChar(255)
  variantB_Desc   String    @map("variant_b_desc") @db.Text
  currentVariant  String    @default("A") @map("current_variant") @db.VarChar(1)
  startDate       DateTime  @map("start_date") @db.Timestamptz
  endDate         DateTime? @map("end_date") @db.Timestamptz
  status          String    @default("running") @db.VarChar(50) // running, completed, abandoned
  winningVariant  String?   @map("winning_variant") @db.VarChar(1)
  
  page            Page      @relation(fields: [pageId], references: [id], onDelete: Cascade)
}

// Graph of internal links for automated PageRank distribution
model InternalLink {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sourcePageId    String   @map("source_page_id") @db.Uuid
  targetPageId    String   @map("target_page_id") @db.Uuid
  anchorText      String   @map("anchor_text") @db.VarChar(255)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  sourcePage      Page     @relation("SourceLinks", fields: [sourcePageId], references: [id], onDelete: Cascade)
  targetPage      Page     @relation("TargetLinks", fields: [targetPageId], references: [id], onDelete: Cascade)

  @@unique([sourcePageId, targetPageId])
}
```
*(Note: You must add `analyticsLogs PageAnalyticsLog[]`, `metaExperiments MetaExperiment[]`, `outboundLinks InternalLink[] @relation("SourceLinks")`, and `inboundLinks InternalLink[] @relation("TargetLinks")` to the `Page` model from Phase 1).*

---

## 3. Core Modules & Services (NestJS Architecture)

### 3.1 `AnalyticsSyncService` (GSC & GA4 Ingestion)
This service utilizes `@nestjs/schedule` (Cron) and BullMQ to fetch data without hitting API rate limits.

*   **Workflow:**
    1.  A daily cron job pushes an `AccountSyncJob` to the Redis queue for every connected `Site`.
    2.  The worker queries the Google Search Console API for the last $3$ days of data (to account for Google's data lag).
    3.  Upserts data into `PageAnalyticsLog`.

### 3.2 `PerformanceEvaluationService` (The Trigger Engine)
This is the mathematical brain of Phase 2. It scans `PageAnalyticsLog` weekly to identify pages that require intervention.

**Evaluation Mathematical Models:**

1.  **Traffic Decay Detection:**
    A page is flagged for an "AI Critic Rewrite" if its average traffic over the last $14$ days drops significantly compared to the previous $14$ days:
    $$ \Delta T = \frac{T_{current} - T_{previous}}{T_{previous}} \times 100 $$
    *Condition:* If $\Delta T \le -15\%$, trigger `TaskType.CONTENT_REFRESH`.

2.  **CTR Underperformance (Meta Tag Optimization):**
    We calculate the expected CTR based on average position using an exponential decay model:
    $$ E(CTR) = \alpha \times \text{Position}^{-\beta} $$
    *(Where $\alpha$ and $\beta$ are baseline constants derived from the site's historical averages, typically $\alpha \approx 0.3$ and $\beta \approx 0.8$.)*
    
    *Condition:* If $\text{CTR}_{actual} < E(CTR) - 2\%$ AND Impressions $> 500$, trigger `TaskType.META_EXPERIMENT`.

### 3.3 `AiCriticService` (Content Refreshes)
When a `CONTENT_REFRESH` task is generated, this service uses the LLM to update the JSONB content block.
*   **Prompt Engineering Structure:** The LLM is provided with:
    *   The original article content.
    *   The target keyword.
    *   GSC Search Queries the page is *almost* ranking for (Positions 11-20).
*   **Action:** The LLM injects a new `FAQ` section or expands a specific `h2` block to capture the missing impressions, bumping the word count and semantic relevance.

### 3.4 `MetaOptimizationService` (A/B Testing)
Executes dynamic testing of titles and descriptions.
*   Generates a new Variant B using the LLM (instructed to use power words, numbers, or curiosity gaps).
*   Rotates the meta tags in the frontend SSR (Next.js) by updating the `Page` record.
*   **Statistical Significance (Z-Test):** After $14$ days, the service compares the CTR of Variant A ($P_A$) and Variant B ($P_B$).
    $$ Z = \frac{P_B - P_A}{\sqrt{P_{pool}(1-P_{pool}) \left(\frac{1}{n_A} + \frac{1}{n_B}\right)}} $$
    *(Where $n$ = impressions, $P$ = clicks/impressions, $P_{pool}$ = pooled CTR).*
    If $Z > 1.96$ ($95\%$ confidence), Variant B is declared the winner and permanently applied.

### 3.5 `InternalLinkingService` (Semantic Graphing)
To boost direct booking pages (Villas), blog posts must link back to them using optimized anchor text.
*   **Logic:** When a new `Page` is published, this service analyzes the text. If it finds entities matching a Villa's location or features (e.g., "private pool", "Bali beachfront"), it converts the text into a hyperlink targeting the corresponding `Villa` page.
*   **Safety Limit:** Capped at $3$ internal links per $1000$ words to avoid over-optimization penalties (Google SpamBrain).

---

## 4. BullMQ Queue Architecture

Phase 2 requires dedicated Redis queues to isolate long-running analytics jobs from immediate AI generation jobs.

```typescript
// nestjs/bullmq queue registration
BullModule.registerQueue(
  { name: 'analytics-sync-queue' }, // Daily GSC/GA4 fetching
  { name: 'evaluation-queue' },     // Weekly math models & decay checking
  { name: 'ab-test-queue' },        // Daily checking of Z-scores for Meta experiments
  { name: 'internal-link-queue' }   // Triggered post-publishing to map new links
)
```

**Queue Priorities:**
1.  `internal-link-queue` (Priority: High) - Must happen immediately after content generation.
2.  `ab-test-queue` (Priority: Medium) - Lightweight mathematical checks.
3.  `analytics-sync-queue` (Priority: Low) - Heavy external API usage, subject to rate limits, should process overnight (e.g., 02:00 AM server time).

---

## 5. Implementation Roadmap for Phase 2

1.  **Week 1: Data Pipeline.** Set up GCP Service Accounts. Implement `AnalyticsSyncService` to populate `PageAnalyticsLog`.
2.  **Week 2: Math & Triggers.** Build the `PerformanceEvaluationService`. Implement the $\Delta T$ and $E(CTR)$ algorithms. Schedule the `evaluation-queue`.
3.  **Week 3: Meta A/B Testing.** Implement `MetaExperiment` schema, LLM variant generation, and the $Z$-score validation logic.
4.  **Week 4: The Critic & Linking.** Implement the LLM rewrite prompts in `AiCriticService` and the text-parsing logic in `InternalLinkingService`.