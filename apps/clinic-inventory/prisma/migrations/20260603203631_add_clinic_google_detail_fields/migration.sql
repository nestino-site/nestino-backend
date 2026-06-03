-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "editorialSummary" VARCHAR(1000),
ADD COLUMN     "formattedPhone" VARCHAR(50),
ADD COLUMN     "googleMapsUrl" TEXT,
ADD COLUMN     "googlePhotos" JSONB,
ADD COLUMN     "googleReviews" JSONB,
ADD COLUMN     "openingHours" JSONB,
ADD COLUMN     "placeTypes" TEXT[],
ADD COLUMN     "priceLevel" INTEGER;
