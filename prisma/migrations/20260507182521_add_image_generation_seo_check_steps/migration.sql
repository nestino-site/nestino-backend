-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PipelineStatus" ADD VALUE 'IMAGE_GENERATING';
ALTER TYPE "PipelineStatus" ADD VALUE 'SEO_CHECKING';

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "generatedImageBase64" TEXT,
ADD COLUMN     "imagePrompt" TEXT,
ADD COLUMN     "seoCheckIssues" JSONB,
ADD COLUMN     "seoCheckPassed" BOOLEAN,
ADD COLUMN     "seoCheckScore" INTEGER;
