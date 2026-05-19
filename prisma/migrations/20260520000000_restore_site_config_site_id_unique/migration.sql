-- Restore the SiteConfig.siteId invariant after the numeric ID migration.
-- Prisma uses siteId as the unique selector for siteConfig.upsert().

ALTER TABLE "site_configs"
  ALTER COLUMN "siteId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "site_configs_siteId_key"
  ON "site_configs"("siteId");
