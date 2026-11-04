-- 个人大屏模块：租户隔离（模块模板：GRANT + RLS）

GRANT USAGE ON SCHEMA "modules.dashboard" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "modules.dashboard" TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "modules.dashboard" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;

ALTER TABLE "modules.dashboard"."source_cache" ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_cache_tenant ON "modules.dashboard"."source_cache"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));

ALTER TABLE "modules.dashboard"."countdown" ENABLE ROW LEVEL SECURITY;
CREATE POLICY countdown_tenant ON "modules.dashboard"."countdown"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
