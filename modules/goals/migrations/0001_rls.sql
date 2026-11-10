-- 目标与年度计划模块：租户隔离（模块模板：GRANT + RLS）

GRANT USAGE ON SCHEMA "modules.goals" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "modules.goals" TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "modules.goals" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;

ALTER TABLE "modules.goals"."objective" ENABLE ROW LEVEL SECURITY;
CREATE POLICY objective_tenant ON "modules.goals"."objective"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));

ALTER TABLE "modules.goals"."key_result" ENABLE ROW LEVEL SECURITY;
CREATE POLICY key_result_tenant ON "modules.goals"."key_result"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
