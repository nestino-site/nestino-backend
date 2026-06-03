-- CreateEnum
CREATE TYPE "DestinationPhase" AS ENUM ('PHASE_1', 'PHASE_2', 'PHASE_3');

-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('DISCOVERED', 'ENRICHING', 'REVIEW_PENDING', 'PUBLISHED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'LOGO', 'VIDEO');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'VERIFIED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('LIKERT', 'NUMBER', 'YES_NO', 'TEXT', 'CHOICE');

-- CreateEnum
CREATE TYPE "TruthScoreGrade" AS ENUM ('A', 'B', 'C', 'D', 'F');

-- CreateEnum
CREATE TYPE "TruthScoreStatus" AS ENUM ('PENDING', 'LIVE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DiscoveryRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscoveryTrigger" AS ENUM ('CRON', 'ADMIN', 'API');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'DEDUPED', 'ENRICHING', 'READY_FOR_REVIEW', 'AUTO_PUBLISHED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('CLINIC_PUBLISHED', 'CLINIC_UPDATED', 'TRUTH_SCORE_CHANGED');

-- CreateTable
CREATE TABLE "countries" (
    "id" SERIAL NOT NULL,
    "codeIso2" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "countryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "phase" "DestinationPhase" NOT NULL DEFAULT 'PHASE_1',
    "isActiveDestination" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatments" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accreditations" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" TEXT NOT NULL,
    "regulator" TEXT,
    "countryCode" CHAR(2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accreditations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinics" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" INTEGER,
    "countryId" INTEGER,
    "addressLine" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "geohash" VARCHAR(12),
    "websiteUrl" TEXT,
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "languages" TEXT[],
    "foundedYear" INTEGER,
    "doctorsCount" INTEGER,
    "inHouseLab" BOOLEAN NOT NULL DEFAULT false,
    "shortDescription" VARCHAR(500),
    "longDescription" TEXT,
    "heroImageUrl" TEXT,
    "googlePlaceId" VARCHAR(255),
    "googleRating" DECIMAL(3,1),
    "googleReviewCount" INTEGER,
    "status" "ClinicStatus" NOT NULL DEFAULT 'DISCOVERED',
    "confidenceScore" DOUBLE PRECISION,
    "sourcePayload" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_treatments" (
    "clinicId" INTEGER NOT NULL,
    "treatmentId" INTEGER NOT NULL,
    "isOffered" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "successRateRange" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_treatments_pkey" PRIMARY KEY ("clinicId","treatmentId")
);

-- CreateTable
CREATE TABLE "clinic_accreditations" (
    "clinicId" INTEGER NOT NULL,
    "accreditationId" INTEGER NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "certUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_accreditations_pkey" PRIMARY KEY ("clinicId","accreditationId")
);

-- CreateTable
CREATE TABLE "clinic_pricing_packages" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "treatmentId" INTEGER,
    "packageName" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "basePrice" DECIMAL(12,2),
    "priceMin" DECIMAL(12,2),
    "priceMax" DECIMAL(12,2),
    "includes" JSONB,
    "excludes" JSONB,
    "notes" TEXT,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "sourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_pricing_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_media" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'PHOTO',
    "url" TEXT NOT NULL,
    "caption" VARCHAR(500),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_doctors" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "specialties" TEXT[],
    "profileUrl" TEXT,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truth_score_dimensions" (
    "code" VARCHAR(50) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(4,3) NOT NULL DEFAULT 0.10,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "truth_score_dimensions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "interview_questions" (
    "code" VARCHAR(100) NOT NULL,
    "dimensionCode" VARCHAR(50) NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'LIKERT',
    "options" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "patient_interviews" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "ageBucket" VARCHAR(20),
    "originCountry" CHAR(2),
    "treatmentCode" VARCHAR(50),
    "completedYear" INTEGER,
    "status" "InterviewStatus" NOT NULL DEFAULT 'DRAFT',
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentTimestamp" TIMESTAMP(3),
    "aiSessionId" VARCHAR(255),
    "quotes" JSONB,
    "publishedAt" TIMESTAMP(3),
    "verifiedBy" VARCHAR(255),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" SERIAL NOT NULL,
    "interviewId" INTEGER NOT NULL,
    "questionCode" VARCHAR(100) NOT NULL,
    "dimensionCode" VARCHAR(50) NOT NULL,
    "valueNum" DOUBLE PRECISION,
    "valueText" TEXT,
    "scoredValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_truth_scores" (
    "clinicId" INTEGER NOT NULL,
    "composite" INTEGER,
    "grade" "TruthScoreGrade",
    "dimensionScores" JSONB,
    "interviewCount" INTEGER NOT NULL DEFAULT 0,
    "status" "TruthScoreStatus" NOT NULL DEFAULT 'PENDING',
    "lastComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_truth_scores_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "clinic_truth_score_snapshots" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "composite" INTEGER,
    "grade" "TruthScoreGrade",
    "dimensionScores" JSONB,
    "interviewCount" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_truth_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_reviews" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(255),
    "body" TEXT,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "submitterEmailHash" VARCHAR(64),
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_runs" (
    "id" SERIAL NOT NULL,
    "cityId" INTEGER NOT NULL,
    "triggeredBy" "DiscoveryTrigger" NOT NULL DEFAULT 'ADMIN',
    "status" "DiscoveryRunStatus" NOT NULL DEFAULT 'QUEUED',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "configOverride" JSONB,
    "configSnapshot" JSONB,
    "stats" JSONB,
    "errorLog" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_candidates" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "cityId" INTEGER NOT NULL,
    "rawName" TEXT,
    "googlePlaceId" VARCHAR(255),
    "websiteUrl" TEXT,
    "addressLine" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "dedupKey" VARCHAR(64) NOT NULL,
    "matchedClinicId" INTEGER,
    "enrichmentPayload" JSONB,
    "stepLog" JSONB,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "confidenceScore" DOUBLE PRECISION,
    "confidenceBreakdown" JSONB,
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" SERIAL NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "actor" VARCHAR(255),
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaults" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" VARCHAR(255),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_configs" (
    "cityId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pipeline" JSONB NOT NULL,
    "budgets" JSONB,
    "rateLimits" JSONB,
    "schedule" JSONB,
    "truthScoreOverrides" JSONB,
    "observability" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" VARCHAR(255),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_configs_pkey" PRIMARY KEY ("cityId")
);

-- CreateTable
CREATE TABLE "discovery_config_versions" (
    "id" SERIAL NOT NULL,
    "cityId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(255),

    CONSTRAINT "discovery_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_webhook_deliveries" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "event" "WebhookEventType" NOT NULL,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" VARCHAR(128) NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_codeIso2_key" ON "countries"("codeIso2");

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE INDEX "cities_countryId_idx" ON "cities"("countryId");

-- CreateIndex
CREATE INDEX "cities_slug_idx" ON "cities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "treatments_code_key" ON "treatments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accreditations_code_key" ON "accreditations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_slug_key" ON "clinics"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_googlePlaceId_key" ON "clinics"("googlePlaceId");

-- CreateIndex
CREATE INDEX "clinics_cityId_status_idx" ON "clinics"("cityId", "status");

-- CreateIndex
CREATE INDEX "clinics_status_idx" ON "clinics"("status");

-- CreateIndex
CREATE INDEX "clinics_slug_idx" ON "clinics"("slug");

-- CreateIndex
CREATE INDEX "clinic_pricing_packages_clinicId_isActive_idx" ON "clinic_pricing_packages"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "clinic_media_clinicId_displayOrder_idx" ON "clinic_media"("clinicId", "displayOrder");

-- CreateIndex
CREATE INDEX "clinic_doctors_clinicId_idx" ON "clinic_doctors"("clinicId");

-- CreateIndex
CREATE INDEX "interview_questions_dimensionCode_isActive_idx" ON "interview_questions"("dimensionCode", "isActive");

-- CreateIndex
CREATE INDEX "patient_interviews_clinicId_status_idx" ON "patient_interviews"("clinicId", "status");

-- CreateIndex
CREATE INDEX "interview_answers_interviewId_idx" ON "interview_answers"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_answers_interviewId_questionCode_key" ON "interview_answers"("interviewId", "questionCode");

-- CreateIndex
CREATE INDEX "clinic_truth_score_snapshots_clinicId_computedAt_idx" ON "clinic_truth_score_snapshots"("clinicId", "computedAt");

-- CreateIndex
CREATE INDEX "clinic_reviews_clinicId_status_idx" ON "clinic_reviews"("clinicId", "status");

-- CreateIndex
CREATE INDEX "discovery_runs_cityId_status_idx" ON "discovery_runs"("cityId", "status");

-- CreateIndex
CREATE INDEX "discovery_runs_status_createdAt_idx" ON "discovery_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "discovery_candidates_runId_status_idx" ON "discovery_candidates"("runId", "status");

-- CreateIndex
CREATE INDEX "discovery_candidates_cityId_status_idx" ON "discovery_candidates"("cityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "discovery_candidates_runId_dedupKey_key" ON "discovery_candidates"("runId", "dedupKey");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "discovery_config_versions_cityId_version_idx" ON "discovery_config_versions"("cityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "discovery_config_versions_cityId_version_key" ON "discovery_config_versions"("cityId", "version");

-- CreateIndex
CREATE INDEX "clinic_webhook_deliveries_status_nextRetryAt_idx" ON "clinic_webhook_deliveries"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "clinic_webhook_deliveries_clinicId_idx" ON "clinic_webhook_deliveries"("clinicId");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_treatments" ADD CONSTRAINT "clinic_treatments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_treatments" ADD CONSTRAINT "clinic_treatments_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_accreditations" ADD CONSTRAINT "clinic_accreditations_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_accreditations" ADD CONSTRAINT "clinic_accreditations_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES "accreditations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_pricing_packages" ADD CONSTRAINT "clinic_pricing_packages_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_pricing_packages" ADD CONSTRAINT "clinic_pricing_packages_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_media" ADD CONSTRAINT "clinic_media_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_doctors" ADD CONSTRAINT "clinic_doctors_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_dimensionCode_fkey" FOREIGN KEY ("dimensionCode") REFERENCES "truth_score_dimensions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_interviews" ADD CONSTRAINT "patient_interviews_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "patient_interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_questionCode_fkey" FOREIGN KEY ("questionCode") REFERENCES "interview_questions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_dimensionCode_fkey" FOREIGN KEY ("dimensionCode") REFERENCES "truth_score_dimensions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_truth_scores" ADD CONSTRAINT "clinic_truth_scores_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_truth_score_snapshots" ADD CONSTRAINT "clinic_truth_score_snapshots_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_reviews" ADD CONSTRAINT "clinic_reviews_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_candidates" ADD CONSTRAINT "discovery_candidates_runId_fkey" FOREIGN KEY ("runId") REFERENCES "discovery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_configs" ADD CONSTRAINT "discovery_configs_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_config_versions" ADD CONSTRAINT "discovery_config_versions_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "discovery_configs"("cityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_webhook_deliveries" ADD CONSTRAINT "clinic_webhook_deliveries_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
