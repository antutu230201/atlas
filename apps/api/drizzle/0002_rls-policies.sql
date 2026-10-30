-- 阶段 2a · 租户隔离 RLS（ADR-0005 §4）
-- 第一道防线在应用层（withUser 强制租户上下文），本迁移建立第二道兜底：
-- 运行时应用连接使用非特权角色 atlas_app；所有 workspace 归属表按
-- app.user_id（当前登录用户）经 SECURITY DEFINER 函数过滤。

-- 1) 运行时应用角色（非 superuser，RLS 对其生效）
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'atlas_app') THEN
    CREATE ROLE atlas_app LOGIN PASSWORD 'atlas_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA platform TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform TO atlas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA platform TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT USAGE, SELECT ON SEQUENCES TO atlas_app;

-- 2) 当前用户"可及"的工作空间集合 = 我是成员的 ∪ 我创建的。
--    后者解决自举问题：新建工作空间时创建者还没有 membership 行，
--    WITH CHECK 若只看 membership 会拒绝创始插入（首跑测试发现）。
--    SECURITY DEFINER：函数内部以属主身份读表，避免策略自引用递归。
CREATE OR REPLACE FUNCTION platform.user_workspace_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = platform AS $$
  SELECT m.workspace_id FROM platform.membership m
  WHERE m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  UNION
  SELECT w.id FROM platform.workspace w
  WHERE w.created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

REVOKE ALL ON FUNCTION platform.user_workspace_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.user_workspace_ids() TO atlas_app;

-- 3) 各表启用 RLS 并挂策略（USING 作用于读/删，WITH CHECK 作用于写）
ALTER TABLE platform.workspace ENABLE ROW LEVEL SECURITY;
-- USING 需含 created_by 分支：INSERT ... RETURNING 要求新行同时通过 SELECT 可见性检查，
-- 而 STABLE 函数的快照看不到本语句刚插入的行（阶段 2a 集成测试发现）。
CREATE POLICY workspace_tenant ON platform.workspace
  USING (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
         OR id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
              OR id IN (SELECT platform.user_workspace_ids()));

ALTER TABLE platform.membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_tenant ON platform.membership
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));

ALTER TABLE platform.invitation ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_tenant ON platform.invitation
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));

ALTER TABLE platform.module_install ENABLE ROW LEVEL SECURITY;
CREATE POLICY module_install_tenant ON platform.module_install
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));

ALTER TABLE platform.entitlement ENABLE ROW LEVEL SECURITY;
CREATE POLICY entitlement_tenant ON platform.entitlement
  USING (workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT platform.user_workspace_ids()));

-- 全局事件（workspace_id 为空）对所有登录用户可见
ALTER TABLE platform.event ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_tenant ON platform.event
  USING (workspace_id IS NULL OR workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IS NULL OR workspace_id IN (SELECT platform.user_workspace_ids()));

ALTER TABLE platform.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant ON platform.audit_log
  USING (workspace_id IS NULL OR workspace_id IN (SELECT platform.user_workspace_ids()))
  WITH CHECK (workspace_id IS NULL OR workspace_id IN (SELECT platform.user_workspace_ids()));

-- 通知按接收人过滤
ALTER TABLE platform.notification ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_tenant ON platform.notification
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
