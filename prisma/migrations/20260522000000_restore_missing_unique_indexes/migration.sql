-- Restore unique indexes that were dropped by the numeric ID migration (20260515140000_numeric_ids).
-- When that migration dropped+renamed columns (siteId, subjectId, pageId, keywordId),
-- PostgreSQL automatically dropped all indexes referencing those columns.
-- The same pattern was already observed and fixed for site_configs in 20260520000000_restore_site_config_site_id_unique.

-- ---------------------------------------------------------------------------
-- 1. keywords: @@unique([siteId, keyword, language])
--    Required by Prisma keyword.upsert() → INSERT ... ON CONFLICT (siteId, keyword, language)
-- ---------------------------------------------------------------------------
DELETE FROM keywords
WHERE id NOT IN (
  SELECT MIN(id) FROM keywords GROUP BY "siteId", "keyword", "language"
);

CREATE UNIQUE INDEX IF NOT EXISTS "keywords_siteId_keyword_language_key"
  ON "keywords"("siteId", "keyword", "language");

-- ---------------------------------------------------------------------------
-- 2. pages: @@unique([siteId, slug, language])
-- ---------------------------------------------------------------------------
DELETE FROM pages
WHERE id NOT IN (
  SELECT MIN(id) FROM pages GROUP BY "siteId", "slug", "language"
);

CREATE UNIQUE INDEX IF NOT EXISTS "pages_siteId_slug_language_key"
  ON "pages"("siteId", "slug", "language");

-- ---------------------------------------------------------------------------
-- 3. content_ideas: @@unique([subjectId, slug])
-- ---------------------------------------------------------------------------
DELETE FROM content_ideas
WHERE id NOT IN (
  SELECT MIN(id) FROM content_ideas GROUP BY "subjectId", "slug"
);

CREATE UNIQUE INDEX IF NOT EXISTS "content_ideas_subjectId_slug_key"
  ON "content_ideas"("subjectId", "slug");

-- ---------------------------------------------------------------------------
-- 4. page_keywords: @@unique([pageId, keywordId])
-- ---------------------------------------------------------------------------
DELETE FROM page_keywords
WHERE id NOT IN (
  SELECT MIN(id) FROM page_keywords GROUP BY "pageId", "keywordId"
);

CREATE UNIQUE INDEX IF NOT EXISTS "page_keywords_pageId_keywordId_key"
  ON "page_keywords"("pageId", "keywordId");

-- ---------------------------------------------------------------------------
-- 5. keyword_clusters: mainKeywordId @unique
-- ---------------------------------------------------------------------------
DELETE FROM keyword_clusters
WHERE id NOT IN (
  SELECT MIN(id) FROM keyword_clusters GROUP BY "mainKeywordId"
);

CREATE UNIQUE INDEX IF NOT EXISTS "keyword_clusters_mainKeywordId_key"
  ON "keyword_clusters"("mainKeywordId");
