-- 示例模块：租户隔离（模块模板的一部分 —— 每个模块的迁移都应包含同样的两段）

-- 1) 授权给运行时角色（内核 default privileges 只覆盖 platform schema）
GRANT USAGE ON SCHEMA "modules.sample_note" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "modules.sample_note" TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "modules.sample_note" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;

-- 2) 行级安全（与内核策略同构：按当前用户可及的工作空间过滤）
ALTER TABLE "modules.sample_note"."note" ENABLE ROW LEVEL SECURITY;
CREATE POLICY note_tenant ON "modules.sample_note"."note"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
