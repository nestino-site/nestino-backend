-- Numeric ID migration: TEXT (cuid) PKs/FKs -> INTEGER autoincrement
-- Preserves row data via mapping tables. Export maps with scripts/export-id-mapping.ts

-- ---------------------------------------------------------------------------
-- 1. Build ID mapping tables (old TEXT id -> new INTEGER id)
-- ---------------------------------------------------------------------------
CREATE TABLE "_migration_site_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_content_template_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_platform_user_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_villa_user_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_otp_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_refresh_token_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_keyword_research_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_keyword_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_keyword_cluster_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_subject_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_page_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_content_idea_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_idea_task_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_content_task_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_page_keyword_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_seo_metric_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_ai_generation_log_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_site_config_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_cost_ledger_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);
CREATE TABLE "_migration_prompt_template_map" (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE);

INSERT INTO "_migration_site_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM sites;

INSERT INTO "_migration_content_template_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM content_templates;

INSERT INTO "_migration_platform_user_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM platform_users;

INSERT INTO "_migration_villa_user_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM villa_users;

INSERT INTO "_migration_otp_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM otps;

INSERT INTO "_migration_refresh_token_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM refresh_tokens;

INSERT INTO "_migration_keyword_research_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM keyword_research;

INSERT INTO "_migration_keyword_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM keywords;

INSERT INTO "_migration_keyword_cluster_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM keyword_clusters;

INSERT INTO "_migration_subject_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM subjects;

INSERT INTO "_migration_page_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM pages;

INSERT INTO "_migration_content_idea_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM content_ideas;

INSERT INTO "_migration_idea_task_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM idea_tasks;

INSERT INTO "_migration_content_task_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM content_tasks;

INSERT INTO "_migration_page_keyword_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM page_keywords;

INSERT INTO "_migration_seo_metric_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM seo_metrics;

INSERT INTO "_migration_ai_generation_log_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM ai_generation_logs;

INSERT INTO "_migration_site_config_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM site_configs;

INSERT INTO "_migration_cost_ledger_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "date", id)::INTEGER FROM cost_ledger;

INSERT INTO "_migration_prompt_template_map" (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt")::INTEGER FROM prompt_templates;

-- ---------------------------------------------------------------------------
-- 2. Drop all foreign keys in public schema
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, quote_ident(n.nspname) || '.' || quote_ident(t.relname) AS tbl
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.contype = 'f' AND n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Migrate primary keys and foreign keys per table
-- ---------------------------------------------------------------------------

-- sites
ALTER TABLE sites ADD COLUMN id_new INTEGER;
UPDATE sites s SET id_new = m.new_id FROM "_migration_site_map" m WHERE s.id = m.old_id;
ALTER TABLE sites DROP CONSTRAINT sites_pkey;
ALTER TABLE sites DROP COLUMN id;
ALTER TABLE sites RENAME COLUMN id_new TO id;
ALTER TABLE sites ADD CONSTRAINT sites_pkey PRIMARY KEY (id);
CREATE SEQUENCE sites_id_seq OWNED BY sites.id;
SELECT setval('sites_id_seq', COALESCE((SELECT MAX(id) FROM sites), 0) + 1, false);
ALTER TABLE sites ALTER COLUMN id SET DEFAULT nextval('sites_id_seq');

-- content_templates
ALTER TABLE content_templates ADD COLUMN id_new INTEGER;
UPDATE content_templates t SET id_new = m.new_id FROM "_migration_content_template_map" m WHERE t.id = m.old_id;
ALTER TABLE content_templates DROP CONSTRAINT content_templates_pkey;
ALTER TABLE content_templates DROP COLUMN id;
ALTER TABLE content_templates RENAME COLUMN id_new TO id;
ALTER TABLE content_templates ADD CONSTRAINT content_templates_pkey PRIMARY KEY (id);
CREATE SEQUENCE content_templates_id_seq OWNED BY content_templates.id;
SELECT setval('content_templates_id_seq', COALESCE((SELECT MAX(id) FROM content_templates), 0) + 1, false);
ALTER TABLE content_templates ALTER COLUMN id SET DEFAULT nextval('content_templates_id_seq');

-- platform_users
ALTER TABLE platform_users ADD COLUMN id_new INTEGER;
UPDATE platform_users u SET id_new = m.new_id FROM "_migration_platform_user_map" m WHERE u.id = m.old_id;
ALTER TABLE platform_users DROP CONSTRAINT platform_users_pkey;
ALTER TABLE platform_users DROP COLUMN id;
ALTER TABLE platform_users RENAME COLUMN id_new TO id;
ALTER TABLE platform_users ADD CONSTRAINT platform_users_pkey PRIMARY KEY (id);
CREATE SEQUENCE platform_users_id_seq OWNED BY platform_users.id;
SELECT setval('platform_users_id_seq', COALESCE((SELECT MAX(id) FROM platform_users), 0) + 1, false);
ALTER TABLE platform_users ALTER COLUMN id SET DEFAULT nextval('platform_users_id_seq');

-- villa_users
ALTER TABLE villa_users ADD COLUMN id_new INTEGER;
UPDATE villa_users u SET id_new = m.new_id FROM "_migration_villa_user_map" m WHERE u.id = m.old_id;
ALTER TABLE villa_users DROP CONSTRAINT villa_users_pkey;
ALTER TABLE villa_users DROP COLUMN id;
ALTER TABLE villa_users RENAME COLUMN id_new TO id;
ALTER TABLE villa_users ADD CONSTRAINT villa_users_pkey PRIMARY KEY (id);
CREATE SEQUENCE villa_users_id_seq OWNED BY villa_users.id;
SELECT setval('villa_users_id_seq', COALESCE((SELECT MAX(id) FROM villa_users), 0) + 1, false);
ALTER TABLE villa_users ALTER COLUMN id SET DEFAULT nextval('villa_users_id_seq');

-- otps
ALTER TABLE otps ADD COLUMN id_new INTEGER;
UPDATE otps o SET id_new = m.new_id FROM "_migration_otp_map" m WHERE o.id = m.old_id;
ALTER TABLE otps DROP CONSTRAINT otps_pkey;
ALTER TABLE otps DROP COLUMN id;
ALTER TABLE otps RENAME COLUMN id_new TO id;
ALTER TABLE otps ADD CONSTRAINT otps_pkey PRIMARY KEY (id);
CREATE SEQUENCE otps_id_seq OWNED BY otps.id;
SELECT setval('otps_id_seq', COALESCE((SELECT MAX(id) FROM otps), 0) + 1, false);
ALTER TABLE otps ALTER COLUMN id SET DEFAULT nextval('otps_id_seq');

-- refresh_tokens
ALTER TABLE refresh_tokens ADD COLUMN id_new INTEGER;
ALTER TABLE refresh_tokens ADD COLUMN "villaUserId_new" INTEGER;
UPDATE refresh_tokens r SET id_new = m.new_id FROM "_migration_refresh_token_map" m WHERE r.id = m.old_id;
UPDATE refresh_tokens r SET "villaUserId_new" = m.new_id FROM "_migration_villa_user_map" m WHERE r."villaUserId" = m.old_id;
ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_tokens_pkey;
ALTER TABLE refresh_tokens DROP COLUMN id;
ALTER TABLE refresh_tokens DROP COLUMN "villaUserId";
ALTER TABLE refresh_tokens RENAME COLUMN id_new TO id;
ALTER TABLE refresh_tokens RENAME COLUMN "villaUserId_new" TO "villaUserId";
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);
CREATE SEQUENCE refresh_tokens_id_seq OWNED BY refresh_tokens.id;
SELECT setval('refresh_tokens_id_seq', COALESCE((SELECT MAX(id) FROM refresh_tokens), 0) + 1, false);
ALTER TABLE refresh_tokens ALTER COLUMN id SET DEFAULT nextval('refresh_tokens_id_seq');

-- keyword_research
ALTER TABLE keyword_research ADD COLUMN id_new INTEGER;
UPDATE keyword_research kr SET id_new = m.new_id FROM "_migration_keyword_research_map" m WHERE kr.id = m.old_id;
ALTER TABLE keyword_research DROP CONSTRAINT keyword_research_pkey;
ALTER TABLE keyword_research DROP COLUMN id;
ALTER TABLE keyword_research RENAME COLUMN id_new TO id;
ALTER TABLE keyword_research ADD CONSTRAINT keyword_research_pkey PRIMARY KEY (id);
CREATE SEQUENCE keyword_research_id_seq OWNED BY keyword_research.id;
SELECT setval('keyword_research_id_seq', COALESCE((SELECT MAX(id) FROM keyword_research), 0) + 1, false);
ALTER TABLE keyword_research ALTER COLUMN id SET DEFAULT nextval('keyword_research_id_seq');

-- keywords
ALTER TABLE keywords ADD COLUMN id_new INTEGER;
ALTER TABLE keywords ADD COLUMN "siteId_new" INTEGER;
ALTER TABLE keywords ADD COLUMN "baseKeywordId_new" INTEGER;
UPDATE keywords k SET id_new = m.new_id FROM "_migration_keyword_map" m WHERE k.id = m.old_id;
UPDATE keywords k SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE k."siteId" = m.old_id;
UPDATE keywords k SET "baseKeywordId_new" = m.new_id FROM "_migration_keyword_map" m WHERE k."baseKeywordId" = m.old_id;
ALTER TABLE keywords DROP CONSTRAINT keywords_pkey;
ALTER TABLE keywords DROP COLUMN id;
ALTER TABLE keywords DROP COLUMN "siteId";
ALTER TABLE keywords DROP COLUMN "baseKeywordId";
ALTER TABLE keywords RENAME COLUMN id_new TO id;
ALTER TABLE keywords RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE keywords RENAME COLUMN "baseKeywordId_new" TO "baseKeywordId";
ALTER TABLE keywords ADD CONSTRAINT keywords_pkey PRIMARY KEY (id);
CREATE SEQUENCE keywords_id_seq OWNED BY keywords.id;
SELECT setval('keywords_id_seq', COALESCE((SELECT MAX(id) FROM keywords), 0) + 1, false);
ALTER TABLE keywords ALTER COLUMN id SET DEFAULT nextval('keywords_id_seq');

-- keyword_clusters
ALTER TABLE keyword_clusters ADD COLUMN id_new INTEGER;
ALTER TABLE keyword_clusters ADD COLUMN "siteId_new" INTEGER;
ALTER TABLE keyword_clusters ADD COLUMN "mainKeywordId_new" INTEGER;
ALTER TABLE keyword_clusters ADD COLUMN "secondaryKeywordIds_new" INTEGER[];
UPDATE keyword_clusters kc SET id_new = m.new_id FROM "_migration_keyword_cluster_map" m WHERE kc.id = m.old_id;
UPDATE keyword_clusters kc SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE kc."siteId" = m.old_id;
UPDATE keyword_clusters kc SET "mainKeywordId_new" = m.new_id FROM "_migration_keyword_map" m WHERE kc."mainKeywordId" = m.old_id;
UPDATE keyword_clusters kc SET "secondaryKeywordIds_new" = (
  SELECT COALESCE(array_agg(km.new_id ORDER BY u.ord), ARRAY[]::INTEGER[])
  FROM unnest(kc."secondaryKeywordIds") WITH ORDINALITY AS u(old_id, ord)
  LEFT JOIN "_migration_keyword_map" km ON km.old_id = u.old_id
);
ALTER TABLE keyword_clusters DROP CONSTRAINT keyword_clusters_pkey;
ALTER TABLE keyword_clusters DROP COLUMN id;
ALTER TABLE keyword_clusters DROP COLUMN "siteId";
ALTER TABLE keyword_clusters DROP COLUMN "mainKeywordId";
ALTER TABLE keyword_clusters DROP COLUMN "secondaryKeywordIds";
ALTER TABLE keyword_clusters RENAME COLUMN id_new TO id;
ALTER TABLE keyword_clusters RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE keyword_clusters RENAME COLUMN "mainKeywordId_new" TO "mainKeywordId";
ALTER TABLE keyword_clusters RENAME COLUMN "secondaryKeywordIds_new" TO "secondaryKeywordIds";
ALTER TABLE keyword_clusters ADD CONSTRAINT keyword_clusters_pkey PRIMARY KEY (id);
CREATE SEQUENCE keyword_clusters_id_seq OWNED BY keyword_clusters.id;
SELECT setval('keyword_clusters_id_seq', COALESCE((SELECT MAX(id) FROM keyword_clusters), 0) + 1, false);
ALTER TABLE keyword_clusters ALTER COLUMN id SET DEFAULT nextval('keyword_clusters_id_seq');

-- subjects
ALTER TABLE subjects ADD COLUMN id_new INTEGER;
ALTER TABLE subjects ADD COLUMN "siteId_new" INTEGER;
ALTER TABLE subjects ADD COLUMN "templateId_new" INTEGER;
UPDATE subjects s SET id_new = m.new_id FROM "_migration_subject_map" m WHERE s.id = m.old_id;
UPDATE subjects s SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE s."siteId" = m.old_id;
UPDATE subjects s SET "templateId_new" = m.new_id FROM "_migration_content_template_map" m WHERE s."templateId" = m.old_id;
ALTER TABLE subjects DROP CONSTRAINT subjects_pkey;
ALTER TABLE subjects DROP COLUMN id;
ALTER TABLE subjects DROP COLUMN "siteId";
ALTER TABLE subjects DROP COLUMN "templateId";
ALTER TABLE subjects RENAME COLUMN id_new TO id;
ALTER TABLE subjects RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE subjects RENAME COLUMN "templateId_new" TO "templateId";
ALTER TABLE subjects ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);
CREATE SEQUENCE subjects_id_seq OWNED BY subjects.id;
SELECT setval('subjects_id_seq', COALESCE((SELECT MAX(id) FROM subjects), 0) + 1, false);
ALTER TABLE subjects ALTER COLUMN id SET DEFAULT nextval('subjects_id_seq');

-- pages
ALTER TABLE pages ADD COLUMN id_new INTEGER;
ALTER TABLE pages ADD COLUMN "siteId_new" INTEGER;
ALTER TABLE pages ADD COLUMN "keywordId_new" INTEGER;
UPDATE pages p SET id_new = m.new_id FROM "_migration_page_map" m WHERE p.id = m.old_id;
UPDATE pages p SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE p."siteId" = m.old_id;
UPDATE pages p SET "keywordId_new" = m.new_id FROM "_migration_keyword_map" m WHERE p."keywordId" = m.old_id;
ALTER TABLE pages DROP CONSTRAINT pages_pkey;
ALTER TABLE pages DROP COLUMN id;
ALTER TABLE pages DROP COLUMN "siteId";
ALTER TABLE pages DROP COLUMN "keywordId";
ALTER TABLE pages RENAME COLUMN id_new TO id;
ALTER TABLE pages RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE pages RENAME COLUMN "keywordId_new" TO "keywordId";
ALTER TABLE pages ADD CONSTRAINT pages_pkey PRIMARY KEY (id);
CREATE SEQUENCE pages_id_seq OWNED BY pages.id;
SELECT setval('pages_id_seq', COALESCE((SELECT MAX(id) FROM pages), 0) + 1, false);
ALTER TABLE pages ALTER COLUMN id SET DEFAULT nextval('pages_id_seq');

-- content_ideas
ALTER TABLE content_ideas ADD COLUMN id_new INTEGER;
ALTER TABLE content_ideas ADD COLUMN "subjectId_new" INTEGER;
UPDATE content_ideas ci SET id_new = m.new_id FROM "_migration_content_idea_map" m WHERE ci.id = m.old_id;
UPDATE content_ideas ci SET "subjectId_new" = m.new_id FROM "_migration_subject_map" m WHERE ci."subjectId" = m.old_id;
ALTER TABLE content_ideas DROP CONSTRAINT content_ideas_pkey;
ALTER TABLE content_ideas DROP COLUMN id;
ALTER TABLE content_ideas DROP COLUMN "subjectId";
ALTER TABLE content_ideas RENAME COLUMN id_new TO id;
ALTER TABLE content_ideas RENAME COLUMN "subjectId_new" TO "subjectId";
ALTER TABLE content_ideas ADD CONSTRAINT content_ideas_pkey PRIMARY KEY (id);
CREATE SEQUENCE content_ideas_id_seq OWNED BY content_ideas.id;
SELECT setval('content_ideas_id_seq', COALESCE((SELECT MAX(id) FROM content_ideas), 0) + 1, false);
ALTER TABLE content_ideas ALTER COLUMN id SET DEFAULT nextval('content_ideas_id_seq');

-- idea_tasks
ALTER TABLE idea_tasks ADD COLUMN id_new INTEGER;
ALTER TABLE idea_tasks ADD COLUMN "ideaId_new" INTEGER;
ALTER TABLE idea_tasks ADD COLUMN "subjectId_new" INTEGER;
ALTER TABLE idea_tasks ADD COLUMN "siteId_new" INTEGER;
UPDATE idea_tasks it SET id_new = m.new_id FROM "_migration_idea_task_map" m WHERE it.id = m.old_id;
UPDATE idea_tasks it SET "ideaId_new" = m.new_id FROM "_migration_content_idea_map" m WHERE it."ideaId" = m.old_id;
UPDATE idea_tasks it SET "subjectId_new" = m.new_id FROM "_migration_subject_map" m WHERE it."subjectId" = m.old_id;
UPDATE idea_tasks it SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE it."siteId" = m.old_id;
ALTER TABLE idea_tasks DROP CONSTRAINT idea_tasks_pkey;
ALTER TABLE idea_tasks DROP COLUMN id;
ALTER TABLE idea_tasks DROP COLUMN "ideaId";
ALTER TABLE idea_tasks DROP COLUMN "subjectId";
ALTER TABLE idea_tasks DROP COLUMN "siteId";
ALTER TABLE idea_tasks RENAME COLUMN id_new TO id;
ALTER TABLE idea_tasks RENAME COLUMN "ideaId_new" TO "ideaId";
ALTER TABLE idea_tasks RENAME COLUMN "subjectId_new" TO "subjectId";
ALTER TABLE idea_tasks RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE idea_tasks ADD CONSTRAINT idea_tasks_pkey PRIMARY KEY (id);
CREATE SEQUENCE idea_tasks_id_seq OWNED BY idea_tasks.id;
SELECT setval('idea_tasks_id_seq', COALESCE((SELECT MAX(id) FROM idea_tasks), 0) + 1, false);
ALTER TABLE idea_tasks ALTER COLUMN id SET DEFAULT nextval('idea_tasks_id_seq');

-- content_tasks
ALTER TABLE content_tasks ADD COLUMN id_new INTEGER;
ALTER TABLE content_tasks ADD COLUMN "siteId_new" INTEGER;
ALTER TABLE content_tasks ADD COLUMN "keywordId_new" INTEGER;
ALTER TABLE content_tasks ADD COLUMN "pageId_new" INTEGER;
UPDATE content_tasks ct SET id_new = m.new_id FROM "_migration_content_task_map" m WHERE ct.id = m.old_id;
UPDATE content_tasks ct SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE ct."siteId" = m.old_id;
UPDATE content_tasks ct SET "keywordId_new" = m.new_id FROM "_migration_keyword_map" m WHERE ct."keywordId" = m.old_id;
UPDATE content_tasks ct SET "pageId_new" = m.new_id FROM "_migration_page_map" m WHERE ct."pageId" = m.old_id;
ALTER TABLE content_tasks DROP CONSTRAINT content_tasks_pkey;
ALTER TABLE content_tasks DROP COLUMN id;
ALTER TABLE content_tasks DROP COLUMN "siteId";
ALTER TABLE content_tasks DROP COLUMN "keywordId";
ALTER TABLE content_tasks DROP COLUMN "pageId";
ALTER TABLE content_tasks RENAME COLUMN id_new TO id;
ALTER TABLE content_tasks RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE content_tasks RENAME COLUMN "keywordId_new" TO "keywordId";
ALTER TABLE content_tasks RENAME COLUMN "pageId_new" TO "pageId";
ALTER TABLE content_tasks ADD CONSTRAINT content_tasks_pkey PRIMARY KEY (id);
CREATE SEQUENCE content_tasks_id_seq OWNED BY content_tasks.id;
SELECT setval('content_tasks_id_seq', COALESCE((SELECT MAX(id) FROM content_tasks), 0) + 1, false);
ALTER TABLE content_tasks ALTER COLUMN id SET DEFAULT nextval('content_tasks_id_seq');

-- page_keywords
ALTER TABLE page_keywords ADD COLUMN id_new INTEGER;
ALTER TABLE page_keywords ADD COLUMN "pageId_new" INTEGER;
ALTER TABLE page_keywords ADD COLUMN "keywordId_new" INTEGER;
UPDATE page_keywords pk SET id_new = m.new_id FROM "_migration_page_keyword_map" m WHERE pk.id = m.old_id;
UPDATE page_keywords pk SET "pageId_new" = m.new_id FROM "_migration_page_map" m WHERE pk."pageId" = m.old_id;
UPDATE page_keywords pk SET "keywordId_new" = m.new_id FROM "_migration_keyword_map" m WHERE pk."keywordId" = m.old_id;
ALTER TABLE page_keywords DROP CONSTRAINT page_keywords_pkey;
ALTER TABLE page_keywords DROP COLUMN id;
ALTER TABLE page_keywords DROP COLUMN "pageId";
ALTER TABLE page_keywords DROP COLUMN "keywordId";
ALTER TABLE page_keywords RENAME COLUMN id_new TO id;
ALTER TABLE page_keywords RENAME COLUMN "pageId_new" TO "pageId";
ALTER TABLE page_keywords RENAME COLUMN "keywordId_new" TO "keywordId";
ALTER TABLE page_keywords ADD CONSTRAINT page_keywords_pkey PRIMARY KEY (id);
CREATE SEQUENCE page_keywords_id_seq OWNED BY page_keywords.id;
SELECT setval('page_keywords_id_seq', COALESCE((SELECT MAX(id) FROM page_keywords), 0) + 1, false);
ALTER TABLE page_keywords ALTER COLUMN id SET DEFAULT nextval('page_keywords_id_seq');

-- seo_metrics
ALTER TABLE seo_metrics ADD COLUMN id_new INTEGER;
ALTER TABLE seo_metrics ADD COLUMN "siteId_new" INTEGER;
ALTER TABLE seo_metrics ADD COLUMN "pageId_new" INTEGER;
UPDATE seo_metrics sm SET id_new = m.new_id FROM "_migration_seo_metric_map" m WHERE sm.id = m.old_id;
UPDATE seo_metrics sm SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE sm."siteId" = m.old_id;
UPDATE seo_metrics sm SET "pageId_new" = m.new_id FROM "_migration_page_map" m WHERE sm."pageId" = m.old_id;
ALTER TABLE seo_metrics DROP CONSTRAINT seo_metrics_pkey;
ALTER TABLE seo_metrics DROP COLUMN id;
ALTER TABLE seo_metrics DROP COLUMN "siteId";
ALTER TABLE seo_metrics DROP COLUMN "pageId";
ALTER TABLE seo_metrics RENAME COLUMN id_new TO id;
ALTER TABLE seo_metrics RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE seo_metrics RENAME COLUMN "pageId_new" TO "pageId";
ALTER TABLE seo_metrics ADD CONSTRAINT seo_metrics_pkey PRIMARY KEY (id);
CREATE SEQUENCE seo_metrics_id_seq OWNED BY seo_metrics.id;
SELECT setval('seo_metrics_id_seq', COALESCE((SELECT MAX(id) FROM seo_metrics), 0) + 1, false);
ALTER TABLE seo_metrics ALTER COLUMN id SET DEFAULT nextval('seo_metrics_id_seq');

-- ai_generation_logs
ALTER TABLE ai_generation_logs ADD COLUMN id_new INTEGER;
ALTER TABLE ai_generation_logs ADD COLUMN "pageId_new" INTEGER;
UPDATE ai_generation_logs al SET id_new = m.new_id FROM "_migration_ai_generation_log_map" m WHERE al.id = m.old_id;
UPDATE ai_generation_logs al SET "pageId_new" = m.new_id FROM "_migration_page_map" m WHERE al."pageId" = m.old_id;
ALTER TABLE ai_generation_logs DROP CONSTRAINT ai_generation_logs_pkey;
ALTER TABLE ai_generation_logs DROP COLUMN id;
ALTER TABLE ai_generation_logs DROP COLUMN "pageId";
ALTER TABLE ai_generation_logs RENAME COLUMN id_new TO id;
ALTER TABLE ai_generation_logs RENAME COLUMN "pageId_new" TO "pageId";
ALTER TABLE ai_generation_logs ADD CONSTRAINT ai_generation_logs_pkey PRIMARY KEY (id);
CREATE SEQUENCE ai_generation_logs_id_seq OWNED BY ai_generation_logs.id;
SELECT setval('ai_generation_logs_id_seq', COALESCE((SELECT MAX(id) FROM ai_generation_logs), 0) + 1, false);
ALTER TABLE ai_generation_logs ALTER COLUMN id SET DEFAULT nextval('ai_generation_logs_id_seq');

-- site_configs
ALTER TABLE site_configs ADD COLUMN id_new INTEGER;
ALTER TABLE site_configs ADD COLUMN "siteId_new" INTEGER;
UPDATE site_configs sc SET id_new = m.new_id FROM "_migration_site_config_map" m WHERE sc.id = m.old_id;
UPDATE site_configs sc SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE sc."siteId" = m.old_id;
ALTER TABLE site_configs DROP CONSTRAINT site_configs_pkey;
ALTER TABLE site_configs DROP COLUMN id;
ALTER TABLE site_configs DROP COLUMN "siteId";
ALTER TABLE site_configs RENAME COLUMN id_new TO id;
ALTER TABLE site_configs RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE site_configs ADD CONSTRAINT site_configs_pkey PRIMARY KEY (id);
CREATE SEQUENCE site_configs_id_seq OWNED BY site_configs.id;
SELECT setval('site_configs_id_seq', COALESCE((SELECT MAX(id) FROM site_configs), 0) + 1, false);
ALTER TABLE site_configs ALTER COLUMN id SET DEFAULT nextval('site_configs_id_seq');

-- cost_ledger
ALTER TABLE cost_ledger ADD COLUMN id_new INTEGER;
ALTER TABLE cost_ledger ADD COLUMN "siteId_new" INTEGER;
UPDATE cost_ledger cl SET id_new = m.new_id FROM "_migration_cost_ledger_map" m WHERE cl.id = m.old_id;
UPDATE cost_ledger cl SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE cl."siteId" = m.old_id;
ALTER TABLE cost_ledger DROP CONSTRAINT cost_ledger_pkey;
ALTER TABLE cost_ledger DROP COLUMN id;
ALTER TABLE cost_ledger DROP COLUMN "siteId";
ALTER TABLE cost_ledger RENAME COLUMN id_new TO id;
ALTER TABLE cost_ledger RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE cost_ledger ADD CONSTRAINT cost_ledger_pkey PRIMARY KEY (id);
CREATE SEQUENCE cost_ledger_id_seq OWNED BY cost_ledger.id;
SELECT setval('cost_ledger_id_seq', COALESCE((SELECT MAX(id) FROM cost_ledger), 0) + 1, false);
ALTER TABLE cost_ledger ALTER COLUMN id SET DEFAULT nextval('cost_ledger_id_seq');

-- prompt_templates
ALTER TABLE prompt_templates ADD COLUMN id_new INTEGER;
ALTER TABLE prompt_templates ADD COLUMN "siteId_new" INTEGER;
UPDATE prompt_templates pt SET id_new = m.new_id FROM "_migration_prompt_template_map" m WHERE pt.id = m.old_id;
UPDATE prompt_templates pt SET "siteId_new" = m.new_id FROM "_migration_site_map" m WHERE pt."siteId" = m.old_id;
ALTER TABLE prompt_templates DROP CONSTRAINT prompt_templates_pkey;
ALTER TABLE prompt_templates DROP COLUMN id;
ALTER TABLE prompt_templates DROP COLUMN "siteId";
ALTER TABLE prompt_templates RENAME COLUMN id_new TO id;
ALTER TABLE prompt_templates RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE prompt_templates ADD CONSTRAINT prompt_templates_pkey PRIMARY KEY (id);
CREATE SEQUENCE prompt_templates_id_seq OWNED BY prompt_templates.id;
SELECT setval('prompt_templates_id_seq', COALESCE((SELECT MAX(id) FROM prompt_templates), 0) + 1, false);
ALTER TABLE prompt_templates ALTER COLUMN id SET DEFAULT nextval('prompt_templates_id_seq');

-- ---------------------------------------------------------------------------
-- 4. Rewrite JSON payloads (content_tasks, idea_tasks)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "_migration_json_id"(payload JSONB, key TEXT, map_table TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  old_val TEXT;
  new_val INTEGER;
BEGIN
  IF payload IS NULL OR NOT (payload ? key) THEN
    RETURN payload;
  END IF;
  old_val := payload ->> key;
  IF old_val IS NULL OR old_val = '' THEN
    RETURN payload;
  END IF;
  EXECUTE format('SELECT new_id FROM %I WHERE old_id = $1', map_table) INTO new_val USING old_val;
  IF new_val IS NULL THEN
    RETURN payload;
  END IF;
  RETURN jsonb_set(payload, ARRAY[key], to_jsonb(new_val), true);
END;
$$;

UPDATE content_tasks
SET payload = "_migration_json_id"(
  "_migration_json_id"(
    "_migration_json_id"(
      "_migration_json_id"(COALESCE(payload::jsonb, '{}'::jsonb), 'siteId', '_migration_site_map'),
      'pageId', '_migration_page_map'
    ),
    'keywordId', '_migration_keyword_map'
  ),
  'contentTaskId', '_migration_content_task_map'
);

UPDATE idea_tasks
SET payload = "_migration_json_id"(
  "_migration_json_id"(
    "_migration_json_id"(
      "_migration_json_id"(COALESCE(payload::jsonb, '{}'::jsonb), 'siteId', '_migration_site_map'),
      'subjectId', '_migration_subject_map'
    ),
    'ideaId', '_migration_content_idea_map'
  ),
  'contentTaskId', '_migration_content_task_map'
);

DROP FUNCTION "_migration_json_id"(JSONB, TEXT, TEXT);

-- ---------------------------------------------------------------------------
-- 5. Re-create foreign keys
-- ---------------------------------------------------------------------------
ALTER TABLE keywords ADD CONSTRAINT keywords_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE keywords ADD CONSTRAINT keywords_baseKeywordId_fkey FOREIGN KEY ("baseKeywordId") REFERENCES keywords(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE pages ADD CONSTRAINT pages_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE pages ADD CONSTRAINT pages_keywordId_fkey FOREIGN KEY ("keywordId") REFERENCES keywords(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE content_tasks ADD CONSTRAINT content_tasks_keywordId_fkey FOREIGN KEY ("keywordId") REFERENCES keywords(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE content_tasks ADD CONSTRAINT content_tasks_pageId_fkey FOREIGN KEY ("pageId") REFERENCES pages(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE seo_metrics ADD CONSTRAINT seo_metrics_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE seo_metrics ADD CONSTRAINT seo_metrics_pageId_fkey FOREIGN KEY ("pageId") REFERENCES pages(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE ai_generation_logs ADD CONSTRAINT ai_generation_logs_pageId_fkey FOREIGN KEY ("pageId") REFERENCES pages(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE site_configs ADD CONSTRAINT site_configs_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE prompt_templates ADD CONSTRAINT prompt_templates_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE cost_ledger ADD CONSTRAINT cost_ledger_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE page_keywords ADD CONSTRAINT page_keywords_pageId_fkey FOREIGN KEY ("pageId") REFERENCES pages(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE page_keywords ADD CONSTRAINT page_keywords_keywordId_fkey FOREIGN KEY ("keywordId") REFERENCES keywords(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE keyword_clusters ADD CONSTRAINT keyword_clusters_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE keyword_clusters ADD CONSTRAINT keyword_clusters_mainKeywordId_fkey FOREIGN KEY ("mainKeywordId") REFERENCES keywords(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_villaUserId_fkey FOREIGN KEY ("villaUserId") REFERENCES villa_users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE subjects ADD CONSTRAINT subjects_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE subjects ADD CONSTRAINT subjects_templateId_fkey FOREIGN KEY ("templateId") REFERENCES content_templates(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE content_ideas ADD CONSTRAINT content_ideas_subjectId_fkey FOREIGN KEY ("subjectId") REFERENCES subjects(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE idea_tasks ADD CONSTRAINT idea_tasks_ideaId_fkey FOREIGN KEY ("ideaId") REFERENCES content_ideas(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE idea_tasks ADD CONSTRAINT idea_tasks_subjectId_fkey FOREIGN KEY ("subjectId") REFERENCES subjects(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE idea_tasks ADD CONSTRAINT idea_tasks_siteId_fkey FOREIGN KEY ("siteId") REFERENCES sites(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Mapping tables retained for scripts/export-id-mapping.ts (drop manually after export if desired)
