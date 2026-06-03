Here is the complete, comprehensive technical documentation for the **Nestino SEO & Traffic Engine**. 

You can copy this entire markdown block and save it as `SEO_ENGINE_SPEC.md` or paste it directly into your Notion/Confluence workspace.

***

# 📖 Nestino SaaS: Automated SEO & Traffic Engine Specification

## 1. Executive Summary
The Nestino SEO Engine is an enterprise-grade, headless content generation system designed to drive zero-commission organic bookings for short-term rentals. It automatically identifies low-competition keywords, utilizes LLMs (Large Language Models) to generate hyper-optimized, structured landing pages based on real villa data, and delivers them at edge-network speeds via a headless Next.js frontend.

### Key Objectives:
*   **Scalability:** Safely generate content for thousands of villas concurrently without hitting LLM rate limits or crashing the backend.
*   **Quality:** Prevent generic "AI text" by using RAG (Retrieval-Augmented Generation) to inject specific villa amenities, real reviews, and local geographic data into prompts.
*   **Zero-Friction:** Villa owners simply connect their domain; the system autonomously handles content creation, Next.js caching, and page rendering.

---

## 2. System Architecture

The architecture follows a decoupled, headless pattern:

1.  **Database (PostgreSQL):** Stores tenant data, keywords, and the generated JSON content.
2.  **Message Broker (Redis + BullMQ):** Manages the queue of AI generation tasks. Controls concurrency, retries, and LLM API rate-limiting.
3.  **Backend (NestJS):** The brain. Pulls jobs from Redis, constructs context (RAG), calls OpenAI/Claude, enforces JSON output, and exposes delivery APIs.
4.  **Frontend (Next.js):** The presentation layer. Uses Wildcard Subdomains and Incremental Static Regeneration (ISR) to render the backend's JSON into blazing-fast HTML.

---

## 3. Database Schema (PostgreSQL)

These tables integrate directly with the existing `accounts` and `villas` core schema. Strict tenant isolation is maintained via `account_id` and `site_id`.

```sql
-- 1. SITES (The Tenant's Website Entity)
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL UNIQUE, -- 'bali.nestino.ai' or custom 'myvilla.com'
    is_custom_domain BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}', -- GA4 ID, branding colors, typography
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. KEYWORDS (The SEO Backlog)
CREATE TABLE keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    term VARCHAR(255) NOT NULL,
    search_volume INT DEFAULT 0,
    difficulty INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'backlog', -- backlog, processing, targeted, ranking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, term)
);

-- 3. PAGES (The Generated Content Payload)
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    villa_id UUID REFERENCES villas(id) ON DELETE SET NULL, 
    slug VARCHAR(255) NOT NULL,
    meta_title VARCHAR(255),
    meta_description TEXT,
    content JSONB NOT NULL DEFAULT '{}', -- Highly structured UI payload
    status VARCHAR(50) DEFAULT 'draft', -- draft, published, archived
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, slug)
);

-- 4. CONTENT TASKS (The AI Worker Queue Log)
CREATE TABLE content_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
    task_type VARCHAR(50) NOT NULL, -- 'generate_page', 'rewrite'
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 5. SEO METRICS (Analytics tracking via Google Search Console)
CREATE TABLE seo_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    ctr NUMERIC(5,2) DEFAULT 0.00, -- Formula: (clicks / impressions) * 100
    average_position NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(page_id, keyword_id, record_date)
);

-- Performance Indexes
CREATE INDEX idx_pages_delivery ON pages(site_id, slug, status);
CREATE INDEX idx_seo_metrics_date ON seo_metrics USING BRIN (record_date);
```

---

## 4. Backend Engineering (NestJS)

### 4.1. Concurrency Management (BullMQ)
To scale to thousands of villas, we never run AI generation in the main event loop. 
*   **Queue Name:** `ai-content-queue`
*   **Concurrency:** Set to 5-10 concurrent jobs maximum to respect OpenAI Rate Limits.
*   **Retries:** 3 automatic retries with Exponential Backoff if the LLM API times out.

### 4.2. RAG & AI Generator Service
Before pinging the LLM, the backend constructs a **Context Object**.

**Step 1: Database Gathering**
```typescript
const context = {
  villaName: villa.name,
  amenities: villa.amenities.map(a => a.name), // e.g., ["Infinity Pool", "1Gbps WiFi"]
  location: villa.city.name,
  distanceToLandmarks: villa.landmarks,
  keyword: keyword.term
};
```

**Step 2: Forced JSON Output**
The prompt strictly enforces a JSON schema. The LLM must not return markdown or conversational text.
```json
// Required LLM Output Structure
{
  "seo": { "title": "Best Canggu Villa with Infinity Pool", "description": "..." },
  "hero": { "headline": "...", "subheadline": "..." },
  "features": [
    {"icon": "wifi", "title": "Work Remote", "description": "1Gbps Fiber..."}
  ],
  "faq": [
    {"question": "How far is the beach?", "answer": "..."}
  ]
}
```

### 4.3. The Delivery API
The public endpoint consumed by the Next.js frontend. It must be heavily optimized to prevent DB bottlenecks.
*   **Route:** `GET /api/v1/delivery/pages`
*   **Query Params:** `?domain=myvilla.com&slug=canggu-pool-villa`
*   **Response:** The raw JSON `content` column from the `pages` table.
*   *Future Scaling:* Wrap this endpoint in Redis caching so the database is never hit directly by frontend traffic.

---

## 5. Frontend Integration (Next.js)

The frontend operates as a "dumb" presentation layer that beautifully paints the JSON provided by NestJS.

### 5.1. Wildcard Domain Routing
Using Next.js Middleware and Dynamic App Routing:
*   File structure: `app/[domain]/[slug]/page.tsx`
*   The middleware intercepts the incoming request, reads the `Host` header (e.g., `bali.nestino.ai` or `myvilla.com`), and maps it to the `[domain]` folder.

### 5.2. Incremental Static Regeneration (ISR)
To ensure the villa sites load in under $50ms$ and pass Google's Core Web Vitals:
1. Next.js fetches the JSON from NestJS on the first request and builds a static HTML page.
2. Next.js caches this HTML at the Edge (CDN).
3. **Webhook Revalidation:** When the NestJS AI worker successfully updates a page or generates a new one, it sends a `POST` request to Next.js (`/api/revalidate?tag=site_id`). Next.js instantly flushes the old cache for that specific villa.

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Database & Entities)
- [ ] Run PostgreSQL DDL scripts to create the 5 SEO tables.
- [ ] Generate Prisma Schema (`schema.prisma`) or TypeORM Entities.
- [ ] Implement `SeoEngineModule` in NestJS with basic CRUD for Sites and Pages.

### Phase 2: Message Broker & Queue Setup
- [ ] Install Redis via Docker.
- [ ] Install `@nestjs/bullmq` and configure the `ai-content-queue`.
- [ ] Create a dummy producer (adds tasks to queue) and consumer (logs tasks to console) to verify queue stability.

### Phase 3: The AI Engine (Core Logic)
- [ ] Integrate `@openai/api` or `@anthropic-ai/sdk`.
- [ ] Write `AiGeneratorService.ts` implementing the RAG context gathering.
- [ ] Define the TypeScript interface for the exact JSON schema the AI must output.
- [ ] Connect the BullMQ consumer to the `AiGeneratorService` to process tasks and save results to the `pages` table.

### Phase 4: Delivery API & Frontend Handshake
- [ ] Create the hyper-fast `PagesDeliveryController` endpoint.
- [ ] Implement the Next.js `[domain]/[slug]/page.tsx` route to fetch and render the JSON.
- [ ] Build the Webhook mechanism in NestJS to trigger Next.js cache revalidation upon AI task completion.

***

