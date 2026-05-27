-- AlterTable
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "contentAuditResult" JSONB;
