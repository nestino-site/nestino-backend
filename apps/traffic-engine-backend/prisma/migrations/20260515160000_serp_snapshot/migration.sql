-- CreateTable
CREATE TABLE "serp_snapshots" (
    "id" SERIAL NOT NULL,
    "keyword" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'us',
    "organicTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organicSnippets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organicLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paaQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedSearches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchVolume" INTEGER,
    "difficulty" DOUBLE PRECISION,
    "hasAiOverview" BOOLEAN NOT NULL DEFAULT false,
    "hasFaqFeature" BOOLEAN NOT NULL DEFAULT false,
    "hasVideoFeature" BOOLEAN NOT NULL DEFAULT false,
    "hasImagePack" BOOLEAN NOT NULL DEFAULT false,
    "rawData" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "serp_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "serp_snapshots_keyword_language_country_key" ON "serp_snapshots"("keyword", "language", "country");

-- CreateIndex
CREATE INDEX "serp_snapshots_keyword_language_idx" ON "serp_snapshots"("keyword", "language");
