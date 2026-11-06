-- netease_binding 表租户隔离（与模块既有 RLS 模式一致）
ALTER TABLE "modules.dashboard"."netease_binding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY netease_binding_tenant ON "modules.dashboard"."netease_binding"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
