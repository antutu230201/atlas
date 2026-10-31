'use client';

import { useSession, useWorkspaces, type SessionUser, type WorkspaceSummary } from '@/lib/queries';
import { useUiStore } from '@/lib/store';

/**
 * 解析"当前激活工作空间"：用户上次选择的 slug 优先，否则取列表第一个。
 * 供外壳导航与各页面共用。
 */
export function useActiveWorkspace(): {
  session: ReturnType<typeof useSession>;
  workspaces: ReturnType<typeof useWorkspaces>;
  workspace: WorkspaceSummary | null;
  user: SessionUser | null;
} {
  const session = useSession();
  const workspaces = useWorkspaces(session.isSuccess);
  const activeSlug = useUiStore((state) => state.activeSlug);
  const list = workspaces.data ?? [];
  const workspace = list.find((w) => w.slug === activeSlug) ?? list[0] ?? null;
  return {
    session,
    workspaces,
    workspace,
    user: session.data?.user ?? null,
  };
}
