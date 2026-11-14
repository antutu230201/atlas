-- 复盘日记模块：租户隔离（模块模板：GRANT + RLS）

GRANT USAGE ON SCHEMA "modules.journal" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "modules.journal" TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "modules.journal" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;

ALTER TABLE "modules.journal"."entry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY entry_tenant ON "modules.journal"."entry"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
