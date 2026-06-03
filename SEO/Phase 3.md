# Nestino Traffic Engine: Phase 3 Documentation (AI Discovery & Trends)

**Document Date:** 1405/01/21 (2026/04/10)
**Module:** Traffic Engine (NestJS Backend)
**Focus:** Real-Time Trend Hijacking, Generative Engine Optimization (GEO), and Multi-Language Scaling.

---

## 1. Phase 3 Objectives
Phase 1 and 2 established a highly optimized, data-driven traditional SEO foundation. Phase 3 shifts the system from *reactive* search to *proactive* discovery, ensuring Nestino properties dominate the next generation of search interfaces.

The primary goals are:
1.  **Trend Discovery:** Integrate Google Trends/Third-party data to detect hyper-local travel spikes (e.g., "digital nomad visa Bali") and autonomously generate content before competitors.
2.  **Generative Engine Optimization (GEO):** Structure content to be explicitly cited by AI search engines like ChatGPT, Perplexity, and Google SGE (Search Generative Experience).
3.  **Multi-Language Scaling:** Auto-translate and localize top-performing English content into secondary languages to capture low-competition international traffic.
4.  **AI Citation Tracking:** Measure how often Nestino villas are recommended by LLMs in response to conversational travel queries.

---

## 2. Database Schema Extensions (Prisma)

We must extend the schema to handle localized page variants, track fleeting trend data, and log AI system citations.

```prisma
// Tracks localized variants of a base page for Hreflang mapping
model LanguageVariant {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  basePageId      String   @map("base_page_id") @db.Uuid
  locale          String   @db.VarChar(10) // e.g., 'es-ES', 'fr-FR', 'id-ID'
  slug            String   @db.VarChar(255)
  metaTitle       String?  @map("meta_title") @db.VarChar(255)
  metaDescription String?  @map("meta_description") @db.Text
  content         Json     @default("{}") @db.JsonB
  status          String   @default("draft") @db.VarChar(50)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz

  basePage        Page     @relation("PageTranslations", fields: [basePageId], references: [id], onDelete: Cascade)

  @@unique([basePageId, locale])
  @@unique([locale, slug]) // Prevent duplicate slugs within the same locale
}

// Stores emerging trends detected via external APIs
model TrendAlert {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  siteId          String   @map("site_id") @db.Uuid
  topic           String   @db.VarChar(255)
  momentumScore   Float    @map("momentum_score") @default(0.0)
  region          String   @db.VarChar(50)
  isActioned      Boolean  @default(false) @map("is_actioned")
  detectedAt      DateTime @default(now()) @map("detected_at") @db.Timestamptz

  site            Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  
  @@index([siteId, momentumScore])
}

// Tracks if AI engines (Perplexity, ChatGPT) are citing the property
model AiCitationLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  villaId         String   @map("villa_id") @db.Uuid
  engine          String   @db.VarChar(50) // 'perplexity', 'chatgpt', 'claude'
  promptUsed      String   @map("prompt_used") @db.Text
  isCited         Boolean  @default(false) @map("is_cited")
  sentimentScore  Float?   @map("sentiment_score") // -1.0 to 1.0
  checkedAt       DateTime @default(now()) @map("checked_at") @db.Timestamptz

  villa           Villa    @relation(fields: [villaId], references: [id], onDelete: Cascade)
}
```
*(Note: Add `languageVariants LanguageVariant[] @relation("PageTranslations")` to the Phase 1 `Page` model, `trendAlerts TrendAlert[]` to the `Site` model, and `aiCitations AiCitationLog[]` to the `Villa` CRM model).*

---

## 3. Core Modules & Services (NestJS Architecture)

### 3.1 `TrendDiscoveryService` (The Radar)
Connects to an external trends provider (e.g., DataForSEO Trends API or Apify Google Trends Scraper).

*   **Workflow:** Runs twice weekly per site, scanning the property's geographical region for breakout travel queries.
*   **Momentum Calculation:**
    To filter out noise, the service calculates a Momentum Score ($M$) using current search volume ($V_c$) against a historical 90-day baseline average ($V_b$), weighted by a recency factor ($W_r$):
    $$ M = \frac{V_c - V_b}{V_b + 1} \times W_r $$
    *Condition:* If $M > 1.5$ (a $150\%$ spike in relative interest), the system logs a `TrendAlert` and automatically pushes a `CONTENT_TASK` to Phase 1's generation queue.

### 3.2 `GenerativeEngineOptimizationService` (GEO Service)
Traditional SEO relies on backlinks; AI search relies on **Entity Density** and **Direct Answers**.
*   **Action:** When content is generated or updated, this service injects structured LLM-friendly formats into the `JSONB` content payload.
*   **Formatting Rules:**
    1.  **Markdown Tables:** AI engines heavily favor tabular data (e.g., "Distance from Villa to Top Attractions").
    2.  **Dense Q&A:** Explicit `FAQPage` JSON-LD schema generation.
    3.  **Statistical Claims:** Injecting numerical facts with source citations to increase the LLM's "trust" in the text.

### 3.3 `LocalizationService` (Multi-Language Expansion)
Automatically translates high-performing English pages to target languages (e.g., German, Spanish, Arabic) based on the Villa owner's settings.
*   **API:** DeepL API (Preferred for nuance) or OpenAI GPT-4o.
*   **Hreflang Management:** When generating a `LanguageVariant`, the service triggers a frontend cache invalidation, ensuring the Next.js app injects the correct `<link rel="alternate" hreflang="xx-XX" href="..." />` tags into the document `<head>` to prevent duplicate content penalties from Google.

### 3.4 `AiCitationTrackingService` (Perplexity / GPT Pinger)
Acts as an automated "Mystery Shopper" to see if AI engines recommend the Villa.
*   **Mechanism:** Generates a synthetic user query (e.g., *"Plan a luxury 3-day itinerary in Phuket for a family of 4, staying in a boutique villa."*) and sends it to the Perplexity API.
*   **Evaluation:** Parses the AI's response text. To accurately detect if the specific Nestino villa was recommended (even if slightly misnamed), we compute the Cosine Similarity between the AI's output vector ($A$) and the Villa's exact profile vector ($B$):
    $$ \text{Similarity} = \frac{\sum_{i=1}^{n} A_i B_i}{\sqrt{\sum_{i=1}^{n} A_i^2} \sqrt{\sum_{i=1}^{n} B_i^2}} $$
    If $\text{Similarity} \ge 0.85$, or the exact brand name is matched via regex, `isCited` is flagged as `true`.

---

## 4. BullMQ Queue Architecture (Phase 3 Additions)

We isolate external API scraping and heavy translation workloads into their own low-priority background queues.

```typescript
// nestjs/bullmq queue registration
BullModule.registerQueue(
  { name: 'trend-ingestion-queue' },    // Weekly Google Trends scraping per region
  { name: 'translation-queue' },        // Batch DeepL API processing (Rate limited)
  { name: 'ai-citation-check-queue' },  // Monthly API pings to LLMs to check brand presence
  { name: 'geo-schema-queue' }          // Post-processing content to inject LLM-friendly schemas
)
```

**Concurrency & Rate Limiting Strategy (Redis):**
*   `translation-queue`: Configured with strict rate limits (e.g., $10$ jobs per minute) to avoid blowing out DeepL/OpenAI API budgets.
*   `ai-citation-check-queue`: Handled asynchronously overnight. If the Perplexity API rate-limits the worker, BullMQ automatically applies an exponential backoff formula for retries:
    $$ \text{Delay} = \text{BaseDelay} \times 2^{\text{Attempt}} $$

---

## 5. Implementation Roadmap for Phase 3

1.  **Week 1: Trend Radar.** Integrate external Trends API. Build `TrendDiscoveryService` and the Momentum ($M$) mathematical trigger.
2.  **Week 2: Global Localization.** Implement the `LanguageVariant` schema, `LocalizationService`, and Next.js frontend mapping for dynamic route localization (e.g., `/es/blog/slug`).
3.  **Week 3: GEO Formatting.** Refactor Phase 1 prompt engineering to strictly output structured tables and high-density FAQs. Implement `geo-schema-queue`.
4.  **Week 4: AI Telemetry.** Implement `AiCitationTrackingService`. Hook up the Perplexity API and configure the Cosine Similarity / regex checks to populate the CRM dashboard with "AI Mentions."