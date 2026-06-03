-- CreateEnum
CREATE TYPE "PageKeywordRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateTable
CREATE TABLE "page_keywords" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "role" "PageKeywordRole" NOT NULL DEFAULT 'SECONDARY',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_clusters" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "mainKeywordId" TEXT NOT NULL,
    "intent" "KeywordIntent" NOT NULL,
    "topic" TEXT NOT NULL,
    "semanticTopics" TEXT[],
    "secondaryKeywordIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_keywords_pageId_role_idx" ON "page_keywords"("pageId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "page_keywords_pageId_keywordId_key" ON "page_keywords"("pageId", "keywordId");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_clusters_mainKeywordId_key" ON "keyword_clusters"("mainKeywordId");

-- CreateIndex
CREATE INDEX "keyword_clusters_siteId_intent_idx" ON "keyword_clusters"("siteId", "intent");

-- AddForeignKey
ALTER TABLE "page_keywords" ADD CONSTRAINT "page_keywords_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_keywords" ADD CONSTRAINT "page_keywords_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_clusters" ADD CONSTRAINT "keyword_clusters_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_clusters" ADD CONSTRAINT "keyword_clusters_mainKeywordId_fkey" FOREIGN KEY ("mainKeywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
