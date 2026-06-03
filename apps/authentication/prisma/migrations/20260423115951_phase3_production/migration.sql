-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('PENDING', 'GENERATING', 'VALIDATING', 'ANALYZING', 'REWRITING', 'READY', 'FAILED', 'PARTIALLY_COMPLETED', 'SKIPPED_STEP');

-- DropForeignKey
ALTER TABLE "pages" DROP CONSTRAINT "pages_keywordId_fkey";

-- DropIndex
DROP INDEX "pages_siteId_status_idx";

-- AlterTable
ALTER TABLE "keyword_research" ALTER COLUMN "suggestions" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "contentDepth" DOUBLE PRECISION,
ADD COLUMN     "contentGaps" TEXT[],
ADD COLUMN     "intentMatch" DOUBLE PRECISION,
ADD COLUMN     "pipelineCheckpoint" JSONB,
ADD COLUMN     "pipelineStatus" "PipelineStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "pipelineVersion" INTEGER,
ADD COLUMN     "redundancyScore" DOUBLE PRECISION,
ALTER COLUMN "language" SET DEFAULT 'EN';

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "languages" DROP DEFAULT;

-- CreateTable
CREATE TABLE "site_configs" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "aiBudgetLimit" DECIMAL(12,2) NOT NULL,
    "qualityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "pipelineConfig" JSONB NOT NULL,
    "modelConfig" JSONB NOT NULL,
    "promptConfig" JSONB NOT NULL,
    "runtimeConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "siteId" TEXT,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'seo',
    "locale" TEXT,
    "abVariant" TEXT,
    "system" TEXT,
    "user" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_ledger" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalCost" DECIMAL(12,6) NOT NULL,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_configs_siteId_key" ON "site_configs"("siteId");

-- CreateIndex
CREATE INDEX "prompt_templates_siteId_type_isActive_idx" ON "prompt_templates"("siteId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_type_version_siteId_abVariant_key" ON "prompt_templates"("type", "version", "siteId", "abVariant");

-- CreateIndex
CREATE INDEX "cost_ledger_siteId_date_idx" ON "cost_ledger"("siteId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cost_ledger_siteId_date_key" ON "cost_ledger"("siteId", "date");

-- CreateIndex
CREATE INDEX "keywords_siteId_language_idx" ON "keywords"("siteId", "language");

-- CreateIndex
CREATE INDEX "keywords_baseKeywordId_idx" ON "keywords"("baseKeywordId");

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_configs" ADD CONSTRAINT "site_configs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
