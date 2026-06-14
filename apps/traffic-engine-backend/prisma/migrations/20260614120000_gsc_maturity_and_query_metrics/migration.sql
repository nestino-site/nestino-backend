-- Add per-site automation maturity unlock timestamp
ALTER TABLE "sites" ADD COLUMN "automationUnlockedAt" TIMESTAMP(3);

-- Replace seo_metrics unique key so per-query GSC rows are retained (not overwritten)
DROP INDEX IF EXISTS "seo_metrics_siteId_pageId_date_key";
CREATE UNIQUE INDEX "seo_metrics_siteId_pageId_query_date_key" ON "seo_metrics"("siteId", "pageId", "query", "date");
CREATE INDEX "seo_metrics_siteId_query_date_idx" ON "seo_metrics"("siteId", "query", "date");
