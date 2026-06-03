Of course. Here is the complete, self-contained documentation and implementation guide for **Phase 1**.

This document provides all necessary SQL, Prisma schema, and NestJS CLI commands. A developer can follow this guide step-by-step to build the entire foundation for the SEO Engine.

---

# 📖 Nestino SEO Engine - Phase 1: Foundation (Database & NestJS Modules)

## 1. Objective
The goal of Phase 1 is to establish the complete data persistence layer and backend application structure for the SEO Engine. By the end of this phase, we will have:
1.  The required PostgreSQL tables created and indexed.
2.  A fully typed ORM (Prisma) client that understands the relationships between the new SEO tables and the existing core tables (`accounts`, `villas`).
3.  A dedicated `SeoEngineModule` within our NestJS application, with the basic file structure for services and controllers in place.

This phase does **not** involve writing any business logic; it is purely about building the foundational plumbing.

---

## 2. Actionable Checklist

### ✅ Step 1: Execute the Database DDL Script
Connect to your PostgreSQL database using a client like DBeaver, `psql`, or TablePlus and execute the following SQL script. This creates the five new tables required for the SEO Engine.

**File:** `migrations/YYYYMMDD_create_seo_engine_tables.sql`
```sql
-- SEO & TRAFFIC ENGINE TABLES

-- 1. SITES (The Tenant's Website Entity)
-- Represents a single website a tenant can manage, tied to their account.
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL UNIQUE, -- e.g., 'villa-aman.nestino.ai' or 'mybalivilla.com'
    is_custom_domain BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}', -- GA4 ID, branding colors, typography
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE sites IS 'Stores tenant-specific website configurations and domains.';

-- 2. KEYWORDS (The SEO Backlog)
-- A list of keywords the system has identified or the user has added for targeting.
CREATE TABLE keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    term VARCHAR(255) NOT NULL,
    search_volume INT DEFAULT 0,
    difficulty INT DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'backlog', -- backlog, processing, targeted, ranking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(site_id, term)
);
COMMENT ON TABLE keywords IS 'SEO keyword targets for a specific site.';

-- 3. PAGES (The Generated Content Payload)
-- Stores the final, AI-generated JSON content for a specific URL slug.
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    villa_id UUID REFERENCES villas(id) ON DELETE SET NULL, -- A page can be linked to a specific villa
    slug VARCHAR(255) NOT NULL,
    meta_title VARCHAR(255),
    meta_description TEXT,
    content JSONB NOT NULL DEFAULT '{}', -- The structured JSON content for the Next.js frontend
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, published, archived
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(site_id, slug)
);
COMMENT ON TABLE pages IS 'Represents a single webpage with its SEO meta and structured content.';

-- 4. CONTENT TASKS (The AI Worker Queue Log)
-- A log of jobs for the AI worker. This is NOT the queue itself (Redis is), but a persistent record.
CREATE TABLE content_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    keyword_id UUID REFERENCES keywords(id) ON DELETE SET NULL,
    page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
    task_type VARCHAR(50) NOT NULL, -- e.g., 'generate_page', 'rewrite_meta_title'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    error_log TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
COMMENT ON TABLE content_tasks IS 'A persistent log of AI content generation jobs.';

-- 5. SEO METRICS (Analytics from Google Search Console)
-- Time-series data to track the performance of pages and keywords.
CREATE TABLE seo_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    keyword_id UUID REFERENCES keywords(id) ON DELETE SET NULL,
    record_date DATE NOT NULL,
    impressions INT NOT NULL DEFAULT 0,
    clicks INT NOT NULL DEFAULT 0,
    ctr NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- (clicks / impressions) * 100
    average_position NUMERIC(5, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(page_id, keyword_id, record_date)
);
COMMENT ON TABLE seo_metrics IS 'Performance data for SEO pages from external sources like GSC.';

-- Performance Indexes
CREATE INDEX idx_sites_account_id ON sites(account_id);
CREATE INDEX idx_pages_delivery ON pages(site_id, slug, status);
CREATE INDEX idx_seo_metrics_record_date ON seo_metrics USING BRIN (record_date);

-- Trigger to automatically update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to tables that have an updated_at column
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON sites
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON pages
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
```

---

### ✅ Step 2: Integrate with Prisma ORM
Now, update your `schema.prisma` file to reflect the new database structure and establish the relationships with your existing models.

1.  **Backup your current `schema.prisma` file.**
2.  Add the following model definitions to your `schema.prisma`. Ensure the relation fields (`account`, `villa`, etc.) correctly reference your existing models.

**File:** `prisma/schema.prisma`
```prisma
// --- Add these new models to your existing schema.prisma file ---

// 1. Tenant's website
model Site {
  id               String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  accountId        String        @map("account_id") @db.Uuid
  domain           String        @unique @db.VarChar(255)
  isCustomDomain   Boolean       @default(false) @map("is_custom_domain")
  settings         Json          @default("{}") @db.JsonB
  createdAt        DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  // --- Relations ---
  account          Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  keywords         Keyword[]
  pages            Page[]
  contentTasks     ContentTask[]
}

// 2. SEO keyword targets
model Keyword {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  siteId        String   @map("site_id") @db.Uuid
  term          String   @db.VarChar(255)
  searchVolume  Int      @default(0) @map("search_volume")
  difficulty    Int      @default(0)
  status        String   @default("backlog") @db.VarChar(50)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  // --- Relations ---
  site          Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  contentTasks  ContentTask[]
  seoMetrics    SeoMetric[]

  @@unique([siteId, term])
}

// 3. Generated webpage content
model Page {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  siteId          String    @map("site_id") @db.Uuid
  villaId         String?   @map("villa_id") @db.Uuid
  slug            String    @db.VarChar(255)
  metaTitle       String?   @map("meta_title") @db.VarChar(255)
  metaDescription String?   @map("meta_description") @db.Text
  content         Json      @default("{}") @db.JsonB
  status          String    @default("draft") @db.VarChar(50)
  publishedAt     DateTime? @map("published_at") @db.Timestamptz
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // --- Relations ---
  site            Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  villa           Villa?    @relation(fields: [villaId], references: [id], onDelete: SetNull)
  contentTasks    ContentTask[]
  seoMetrics      SeoMetric[]

  @@unique([siteId, slug])
}

// 4. Log of AI jobs
model ContentTask {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  siteId      String    @map("site_id") @db.Uuid
  keywordId   String?   @map("keyword_id") @db.Uuid
  pageId      String?   @map("page_id") @db.Uuid
  taskType    String    @map("task_type") @db.VarChar(50)
  status      String    @default("pending") @db.VarChar(50)
  errorLog    String?   @map("error_log") @db.Text
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  completedAt DateTime? @map("completed_at") @db.Timestamptz

  // --- Relations ---
  site        Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  keyword     Keyword?  @relation(fields: [keywordId], references: [id], onDelete: SetNull)
  page        Page?     @relation(fields: [pageId], references: [id], onDelete: SetNull)
}

// 5. SEO performance metrics
model SeoMetric {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pageId          String   @map("page_id") @db.Uuid
  keywordId       String?  @map("keyword_id") @db.Uuid
  recordDate      DateTime @map("record_date") @db.Date
  impressions     Int      @default(0)
  clicks          Int      @default(0)
  ctr             Decimal  @default(0.00) @db.Decimal(5, 2)
  averagePosition Decimal? @map("average_position") @db.Decimal(5, 2)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  // --- Relations ---
  page            Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  keyword         Keyword? @relation(fields: [keywordId], references: [id], onDelete: SetNull)

  @@unique([pageId, keywordId, recordDate])
}

```

3.  **Generate the Prisma Client.** Run the following command in your terminal. This will update the `@prisma/client` in your `node_modules` to include all the new models and their types.
    ```bash
    npx prisma generate
    ```

---

### ✅ Step 3: Scaffold the NestJS Module Architecture
Use the NestJS CLI to create the standardized module and file structure. This keeps the SEO Engine logic cleanly separated from other domains like `Bookings` or `Auth`.

1.  **Run these commands from the root of your NestJS project:**

    ```bash
    # Create the main module for the SEO Engine
    nest g module modules/seo-engine

    # Create services for handling business logic
    nest g service modules/seo-engine/services/sites
    nest g service modules/seo-engine/services/pages
    nest g service modules/seo-engine/services/keywords

    # Create controllers for exposing API endpoints
    nest g controller modules/seo-engine/controllers/sites --flat
    nest g controller modules/seo-engine/controllers/pages --flat
    ```
    *Note: We use `--flat` for controllers to prevent creating an unnecessary extra subdirectory.*

2.  **Verify the Directory Structure.** Your `src/modules` directory should now look like this:
    ```
    src/modules/
    ├── seo-engine/
    │   ├── controllers/
    │   │   ├── pages.controller.ts
    │   │   └── sites.controller.ts
    │   ├── services/
    │   │   ├── keywords.service.ts
    │   │   ├── pages.service.ts
    │   │   └── sites.service.ts
    │   └── seo-engine.module.ts
    └── ... (other modules like AuthModule, etc.)
    ```

3.  **Wire up the Module.** Open `src/modules/seo-engine/seo-engine.module.ts` and ensure the generated services and controllers are correctly registered. You should also import your `PrismaModule` here.

**File:** `src/modules/seo-engine/seo-engine.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module'; // Adjust path if necessary
import { SitesController } from './controllers/sites.controller';
import { PagesController } from './controllers/pages.controller';
import { SitesService } from './services/sites.service';
import { PagesService } from './services/pages.service';
import { KeywordsService } from './services/keywords.service';

@Module({
  imports: [PrismaModule], // Make PrismaService available to our services
  controllers: [SitesController, PagesController],
  providers: [SitesService, PagesService, KeywordsService],
})
export class SeoEngineModule {}

---

## 4. Definition of Done for Phase 1
You have successfully completed this phase when:
- The 5 new tables (`sites`, `keywords`, `pages`, `content_tasks`, `seo_metrics`) exist in your PostgreSQL database.
- The `npx prisma generate` command runs without errors.
- Your NestJS application compiles successfully (`npm run start:dev`) with the new `SeoEngineModule` imported in your main `app.module.ts`.
- The directory structure matches the one specified above.

You are now ready to proceed to **Phase 2: Message Broker & Queue Setup**, where we will begin implementing the background worker infrastructure.