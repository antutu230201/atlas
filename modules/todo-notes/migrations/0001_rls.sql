-- 待办与笔记模块：租户隔离（模块模板：GRANT + RLS）

GRANT USAGE ON SCHEMA "modules.todo_notes" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "modules.todo_notes" TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA "modules.todo_notes" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;

ALTER TABLE "modules.todo_notes"."todo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY todo_tenant ON "modules.todo_notes"."todo"
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));
