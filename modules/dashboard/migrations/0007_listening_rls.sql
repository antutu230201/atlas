-- listening_daily 表租户隔离（与模块既有 RLS 模式一致）
ALTER TABLE "modules.dashboard"."listening_daily" ENABLE ROW LEVEL SECURITY;
CREATE POLICY listening_daily_tenant ON "modules.dashboard"."listening_daily"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
