-- CreateEnum
CREATE TYPE "CannibalizationStatus" AS ENUM ('WINNER', 'LOSER', 'MONITOR', 'NONE');

-- AlterEnum
ALTER TYPE "PipelineStatus" ADD VALUE 'GEO_SCORING';

-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "cannibalizationGroup" TEXT;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "cannibalizationStatus" "CannibalizationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "geoScore" DOUBLE PRECISION,
ADD COLUMN     "geoScorePillars" JSONB;

-- AlterTable
ALTER TABLE "seo_metrics" ADD COLUMN     "ctrExpected" DOUBLE PRECISION,
ADD COLUMN     "ctrGap" DOUBLE PRECISION,
ADD COLUMN     "query" TEXT;
