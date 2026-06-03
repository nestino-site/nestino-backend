-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "KeywordIntent" AS ENUM ('INFORMATIONAL', 'NAVIGATIONAL', 'TRANSACTIONAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "KeywordStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PUBLISHED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'NEEDS_UPDATE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('GENERATE_CONTENT', 'REWRITE_CONTENT', 'GENERATE_META', 'GENERATE_SCHEMA', 'GENERATE_IMAGE');

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "SiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "intent" "KeywordIntent" NOT NULL DEFAULT 'INFORMATIONAL',
    "status" "KeywordStatus" NOT NULL DEFAULT 'PENDING',
    "searchVolume" INTEGER,
    "difficulty" DOUBLE PRECISION,
    "cpc" DOUBLE PRECISION,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "targetUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "keywordId" TEXT,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT,
    "metaDescription" TEXT,
    "content" TEXT,
    "schemaMarkup" JSONB,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "wordCount" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_tasks" (
    "id" TEXT NOT NULL,
    "siteId" TEXT,
    "keywordId" TEXT,
    "pageId" TEXT,
    "type" "TaskType" NOT NULL DEFAULT 'GENERATE_CONTENT',
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "result" JSONB,
    "errorLog" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_metrics" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageId" TEXT,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgPosition" DOUBLE PRECISION,
    "organicSessions" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sites_domain_key" ON "sites"("domain");

-- CreateIndex
CREATE INDEX "sites_domain_idx" ON "sites"("domain");

-- CreateIndex
CREATE INDEX "keywords_siteId_status_idx" ON "keywords"("siteId", "status");

-- CreateIndex
CREATE INDEX "keywords_siteId_priority_idx" ON "keywords"("siteId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_siteId_phrase_locale_key" ON "keywords"("siteId", "phrase", "locale");

-- CreateIndex
CREATE INDEX "pages_siteId_status_idx" ON "pages"("siteId", "status");

-- CreateIndex
CREATE INDEX "pages_siteId_publishedAt_idx" ON "pages"("siteId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pages_siteId_slug_locale_key" ON "pages"("siteId", "slug", "locale");

-- CreateIndex
CREATE INDEX "content_tasks_status_scheduledAt_idx" ON "content_tasks"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "content_tasks_keywordId_idx" ON "content_tasks"("keywordId");

-- CreateIndex
CREATE INDEX "content_tasks_pageId_idx" ON "content_tasks"("pageId");

-- CreateIndex
CREATE INDEX "seo_metrics_siteId_date_idx" ON "seo_metrics"("siteId", "date");

-- CreateIndex
CREATE INDEX "seo_metrics_pageId_date_idx" ON "seo_metrics"("pageId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "seo_metrics_siteId_pageId_date_key" ON "seo_metrics"("siteId", "pageId", "date");

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_tasks" ADD CONSTRAINT "content_tasks_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_tasks" ADD CONSTRAINT "content_tasks_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_metrics" ADD CONSTRAINT "seo_metrics_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_metrics" ADD CONSTRAINT "seo_metrics_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
