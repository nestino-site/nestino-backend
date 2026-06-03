-- Phase 2: enums, site languages, keyword/page reshape, keyword research, AI logs, task locks

-- CreateEnum
CREATE TYPE "ContentLanguage" AS ENUM ('EN', 'AR', 'DE', 'FR', 'ES', 'IT', 'TR', 'NL', 'FA');

-- CreateEnum
CREATE TYPE "ContentStrategy" AS ENUM ('BUDGET', 'BALANCED', 'QUALITY');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('openai', 'anthropic', 'google');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "KeywordResearchSource" AS ENUM ('MANUAL', 'AI', 'GSC');

-- AlterTable sites
ALTER TABLE "sites" ADD COLUMN "defaultLanguage" "ContentLanguage" NOT NULL DEFAULT 'EN';
ALTER TABLE "sites" ADD COLUMN "languages" "ContentLanguage"[] DEFAULT ARRAY['EN']::"ContentLanguage"[];
ALTER TABLE "sites" ADD COLUMN "strategy" "ContentStrategy" NOT NULL DEFAULT 'BALANCED';
ALTER TABLE "sites" ADD COLUMN "gscProperty" TEXT;
ALTER TABLE "sites" ADD COLUMN "ga4PropertyId" TEXT;
ALTER TABLE "sites" ADD COLUMN "aiPipeline" JSONB;

UPDATE "sites" SET "defaultLanguage" = CASE lower("locale")
  WHEN 'ar' THEN 'AR'::"ContentLanguage"
  WHEN 'de' THEN 'DE'::"ContentLanguage"
  WHEN 'fr' THEN 'FR'::"ContentLanguage"
  WHEN 'es' THEN 'ES'::"ContentLanguage"
  WHEN 'it' THEN 'IT'::"ContentLanguage"
  WHEN 'tr' THEN 'TR'::"ContentLanguage"
  WHEN 'nl' THEN 'NL'::"ContentLanguage"
  WHEN 'fa' THEN 'FA'::"ContentLanguage"
  ELSE 'EN'::"ContentLanguage"
END;

UPDATE "sites" SET "languages" = ARRAY["defaultLanguage"]::"ContentLanguage"[];

ALTER TABLE "sites" DROP COLUMN "locale";

-- AlterTable keywords: add new columns, backfill, drop old
ALTER TABLE "keywords" ADD COLUMN "keyword" TEXT;
ALTER TABLE "keywords" ADD COLUMN "language" "ContentLanguage" NOT NULL DEFAULT 'EN';
ALTER TABLE "keywords" ADD COLUMN "baseKeywordId" TEXT;

UPDATE "keywords" SET "keyword" = "phrase";

UPDATE "keywords" SET "language" = CASE lower("locale")
  WHEN 'ar' THEN 'AR'::"ContentLanguage"
  WHEN 'de' THEN 'DE'::"ContentLanguage"
  WHEN 'fr' THEN 'FR'::"ContentLanguage"
  WHEN 'es' THEN 'ES'::"ContentLanguage"
  WHEN 'it' THEN 'IT'::"ContentLanguage"
  WHEN 'tr' THEN 'TR'::"ContentLanguage"
  WHEN 'nl' THEN 'NL'::"ContentLanguage"
  WHEN 'fa' THEN 'FA'::"ContentLanguage"
  ELSE 'EN'::"ContentLanguage"
END;

DROP INDEX IF EXISTS "keywords_siteId_phrase_locale_key";

ALTER TABLE "keywords" ALTER COLUMN "keyword" SET NOT NULL;

ALTER TABLE "keywords" DROP COLUMN "phrase";
ALTER TABLE "keywords" DROP COLUMN "locale";

CREATE UNIQUE INDEX "keywords_siteId_keyword_language_key" ON "keywords"("siteId", "keyword", "language");

ALTER TABLE "keywords" ADD CONSTRAINT "keywords_baseKeywordId_fkey" FOREIGN KEY ("baseKeywordId") REFERENCES "keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable pages
ALTER TABLE "pages" ADD COLUMN "language" "ContentLanguage";
ALTER TABLE "pages" ADD COLUMN "outline" JSONB;
ALTER TABLE "pages" ADD COLUMN "rawDraft" TEXT;
ALTER TABLE "pages" ADD COLUMN "finalContent" TEXT;
ALTER TABLE "pages" ADD COLUMN "metaTitle" TEXT;
ALTER TABLE "pages" ADD COLUMN "seoScore" DOUBLE PRECISION;
ALTER TABLE "pages" ADD COLUMN "readabilityScore" DOUBLE PRECISION;
ALTER TABLE "pages" ADD COLUMN "optimizationCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pages" ADD COLUMN "lastAnalyzedAt" TIMESTAMP(3);

UPDATE "pages" SET "language" = CASE lower("locale")
  WHEN 'ar' THEN 'AR'::"ContentLanguage"
  WHEN 'de' THEN 'DE'::"ContentLanguage"
  WHEN 'fr' THEN 'FR'::"ContentLanguage"
  WHEN 'es' THEN 'ES'::"ContentLanguage"
  WHEN 'it' THEN 'IT'::"ContentLanguage"
  WHEN 'tr' THEN 'TR'::"ContentLanguage"
  WHEN 'nl' THEN 'NL'::"ContentLanguage"
  WHEN 'fa' THEN 'FA'::"ContentLanguage"
  ELSE 'EN'::"ContentLanguage"
END;

UPDATE "pages" SET "finalContent" = "content" WHERE "content" IS NOT NULL;

UPDATE "pages" p
SET "keywordId" = (
  SELECT k.id FROM "keywords" k
  WHERE k."siteId" = p."siteId"
  ORDER BY k."createdAt" ASC
  LIMIT 1
)
WHERE p."keywordId" IS NULL;

DELETE FROM "pages" WHERE "keywordId" IS NULL;

ALTER TABLE "pages" ALTER COLUMN "keywordId" SET NOT NULL;

DROP INDEX IF EXISTS "pages_siteId_slug_locale_key";

ALTER TABLE "pages" DROP COLUMN "locale";
ALTER TABLE "pages" DROP COLUMN "content";

ALTER TABLE "pages" ALTER COLUMN "language" SET NOT NULL;

CREATE UNIQUE INDEX "pages_siteId_slug_language_key" ON "pages"("siteId", "slug", "language");

CREATE INDEX "pages_siteId_language_status_idx" ON "pages"("siteId", "language", "status");

-- AlterTable content_tasks
ALTER TABLE "content_tasks" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "content_tasks" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "content_tasks" ADD COLUMN "lockedBy" TEXT;
ALTER TABLE "content_tasks" ADD COLUMN "currentStep" TEXT;

-- CreateTable keyword_research
CREATE TABLE "keyword_research" (
    "id" TEXT NOT NULL,
    "seedKeyword" TEXT NOT NULL,
    "language" "ContentLanguage" NOT NULL,
    "suggestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "KeywordResearchSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_research_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "keyword_research_seedKeyword_language_idx" ON "keyword_research"("seedKeyword", "language");

-- CreateTable ai_generation_logs
CREATE TABLE "ai_generation_logs" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pipelineVersion" INTEGER,
    "stepKey" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cost" DECIMAL(12,6) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "promptHash" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_generation_logs_pageId_createdAt_idx" ON "ai_generation_logs"("pageId", "createdAt");

CREATE INDEX "ai_generation_logs_stepKey_createdAt_idx" ON "ai_generation_logs"("stepKey", "createdAt");

ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
