-- AlterTable
ALTER TABLE "pages" ADD COLUMN "pageType" TEXT;
ALTER TABLE "pages" ADD COLUMN "entities" JSONB;
ALTER TABLE "pages" ADD COLUMN "contentBlocks" JSONB;
ALTER TABLE "pages" ADD COLUMN "breadcrumbs" JSONB;
ALTER TABLE "pages" ADD COLUMN "robotsMeta" TEXT;
