-- 习惯打卡模块：租户隔离（模块模板：GRANT + RLS）

GRANT USAGE ON SCHEMA "modules.habits" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "modules.habits" TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "modules.habits" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;

ALTER TABLE "modules.habits"."habit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY habit_tenant ON "modules.habits"."habit"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));

ALTER TABLE "modules.habits"."habit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY habit_log_tenant ON "modules.habits"."habit_log"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
