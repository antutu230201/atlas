'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
}

export interface ModuleRoute {
  path: string;
  title: string;
  nav?: { order: number; icon?: string };
}

export interface ModuleStatus {
  name: string;
  version: string;
  title: string;
  description: string;
  enabled: boolean;
  installed: boolean;
  permissions: string[];
  routes: ModuleRoute[];
  widgets?: Array<{ id: string; title: string; component: string; span?: number }>;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export function useSession() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: SessionUser }>('/auth/me'),
    retry: false,
  });
}

export function useWorkspaces(enabled = true) {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceSummary[]>('/workspaces'),
    enabled,
  });
}

/**
 * 统一模块状态查询：侧边栏和设置页共用同一缓存条目。
 * 设置页启停模块后 invalidate 此 key，侧边栏立即更新。
 */
export function useModuleStatus(slug: string | null) {
  return useQuery({
    queryKey: ['module-status', slug],
    queryFn: () => api<ModuleStatus[]>(`/modules/workspaces/${slug}`),
    enabled: Boolean(slug),
  });
}

/** 便捷 hook：只返回已启用的模块 */
export function useEnabledModules(slug: string | null) {
  const query = useModuleStatus(slug);
  return {
    ...query,
    data: query.data?.filter((m) => m.enabled) ?? undefined,
  };
}

export function useNotifications(enabled = true) {
  // 列表接口已改游标分页（{ items, nextCursor }）；这里只要未读数，select 还原数组
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api<{ items: NotificationItem[]; nextCursor: string | null }>('/notifications?limit=50'),
    enabled,
    select: (data) => data.items,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<null>('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.clear(),
  });
}
