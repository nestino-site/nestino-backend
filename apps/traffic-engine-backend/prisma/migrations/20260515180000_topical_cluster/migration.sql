-- CreateTable
CREATE TABLE "topical_clusters" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "pillarSlug" TEXT,
    "pillarPageId" INTEGER,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coverageGap" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topical_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topical_clusters_siteId_idx" ON "topical_clusters"("siteId");

-- AddForeignKey
ALTER TABLE "topical_clusters" ADD CONSTRAINT "topical_clusters_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topical_clusters" ADD CONSTRAINT "topical_clusters_pillarPageId_fkey" FOREIGN KEY ("pillarPageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
