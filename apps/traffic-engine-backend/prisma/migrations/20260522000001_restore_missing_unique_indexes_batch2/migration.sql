-- Restore additional unique indexes dropped by the numeric ID migration (20260515140000_numeric_ids).
-- These were missed in the first batch (20260522000000_restore_missing_unique_indexes).
-- The same root cause: dropping+renaming columns silently drops any index referencing them.

-- ---------------------------------------------------------------------------
-- 1. cost_ledger: @@unique([siteId, date])
--    Required by Prisma costLedger.upsert() → INSERT ... ON CONFLICT ("siteId","date")
--    This is what is currently crashing the content pipeline.
-- ---------------------------------------------------------------------------
DELETE FROM cost_ledger
WHERE id NOT IN (
  SELECT MIN(id) FROM cost_ledger GROUP BY "siteId", "date"
);

CREATE UNIQUE INDEX IF NOT EXISTS "cost_ledger_siteId_date_key"
  ON "cost_ledger"("siteId", "date");

-- ---------------------------------------------------------------------------
-- 2. seo_metrics: @@unique([siteId, pageId, date])
--    siteId and pageId were both dropped+renamed in the numeric_ids migration.
-- ---------------------------------------------------------------------------
DELETE FROM seo_metrics
WHERE id NOT IN (
  SELECT MIN(id) FROM seo_metrics GROUP BY "siteId", "pageId", "date"
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_metrics_siteId_pageId_date_key"
  ON "seo_metrics"("siteId", "pageId", "date");

-- ---------------------------------------------------------------------------
-- 3. prompt_templates: @@unique([type, version, siteId, abVariant])
--    siteId was dropped+renamed in the numeric_ids migration.
-- ---------------------------------------------------------------------------
DELETE FROM prompt_templates
WHERE id NOT IN (
  SELECT MIN(id) FROM prompt_templates GROUP BY "type", "version", "siteId", "abVariant"
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_templates_type_version_siteId_abVariant_key"
  ON "prompt_templates"("type", "version", "siteId", "abVariant");
