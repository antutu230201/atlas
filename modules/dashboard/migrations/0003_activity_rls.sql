-- activity 表租户隔离（与模块既有 RLS 模式一致）

ALTER TABLE "modules.dashboard"."activity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_tenant ON "modules.dashboard"."activity"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
