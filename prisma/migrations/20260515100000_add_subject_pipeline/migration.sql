-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_REVISION');

-- CreateEnum
CREATE TYPE "HallucinationSensitivity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('GENERAL', 'MEDICAL', 'LEGAL', 'FINANCIAL', 'IMMIGRATION', 'PRICING');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('ARTICLE', 'LANDING_PAGE', 'CITY_PAGE', 'FAQ', 'COMPARISON', 'BLOG_POST');

-- CreateEnum
CREATE TYPE "IdeaTaskStatus" AS ENUM ('QUEUED', 'PROCESSING', 'GENERATED', 'FAILED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "content_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contentType" "ContentType" NOT NULL DEFAULT 'ARTICLE',
    "requiredSections" JSONB NOT NULL,
    "headingStructure" JSONB NOT NULL,
    "seoRules" JSONB NOT NULL,
    "faqStructure" JSONB NOT NULL,
    "ctaPlacement" TEXT,
    "internalLinkingRules" JSONB,
    "formattingInstructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "primaryKeywords" TEXT[],
    "secondaryKeywords" TEXT[],
    "searchIntent" "KeywordIntent" NOT NULL DEFAULT 'INFORMATIONAL',
    "language" "ContentLanguage" NOT NULL DEFAULT 'EN',
    "country" TEXT,
    "city" TEXT,
    "seoGoal" TEXT,
    "contentCountTarget" INTEGER NOT NULL DEFAULT 10,
    "hallucinationSensitivity" "HallucinationSensitivity" NOT NULL DEFAULT 'MEDIUM',
    "riskCategory" "RiskCategory" NOT NULL DEFAULT 'GENERAL',
    "requiresFactualValidation" BOOLEAN NOT NULL DEFAULT false,
    "strictReviewMode" BOOLEAN NOT NULL DEFAULT false,
    "status" "SubjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_ideas" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "targetKeyword" TEXT NOT NULL,
    "metaDescription" TEXT,
    "searchIntent" "KeywordIntent" NOT NULL DEFAULT 'INFORMATIONAL',
    "outline" JSONB,
    "headings" TEXT[],
    "faqSuggestions" JSONB,
    "internalLinkingSuggestions" TEXT[],
    "contentType" "ContentType" NOT NULL DEFAULT 'ARTICLE',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hallucinationRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "IdeaStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewNotes" TEXT,
    "generatedBy" "AiProvider",
    "generatedModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_tasks" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "siteId" TEXT,
    "type" "TaskType" NOT NULL DEFAULT 'GENERATE_CONTENT',
    "status" "IdeaTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "result" JSONB,
    "errorLog" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idea_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_templates_contentType_isActive_idx" ON "content_templates"("contentType", "isActive");

-- CreateIndex
CREATE INDEX "subjects_siteId_status_idx" ON "subjects"("siteId", "status");

-- CreateIndex
CREATE INDEX "subjects_templateId_idx" ON "subjects"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "content_ideas_subjectId_slug_key" ON "content_ideas"("subjectId", "slug");

-- CreateIndex
CREATE INDEX "content_ideas_subjectId_status_idx" ON "content_ideas"("subjectId", "status");

-- CreateIndex
CREATE INDEX "content_ideas_subjectId_createdAt_idx" ON "content_ideas"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "idea_tasks_status_createdAt_idx" ON "idea_tasks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "idea_tasks_subjectId_idx" ON "idea_tasks"("subjectId");

-- CreateIndex
CREATE INDEX "idea_tasks_ideaId_idx" ON "idea_tasks"("ideaId");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "content_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_tasks" ADD CONSTRAINT "idea_tasks_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "content_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_tasks" ADD CONSTRAINT "idea_tasks_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_tasks" ADD CONSTRAINT "idea_tasks_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
