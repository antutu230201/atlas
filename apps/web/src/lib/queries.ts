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

export function useEnabledModules(slug: string | null) {
  return useQuery({
    queryKey: ['modules-enabled', slug],
    queryFn: () =>
      api<ModuleStatus[]>(`/modules/workspaces/${slug}`).then((list) =>
        list.filter((m) => m.enabled),
      ),
    enabled: Boolean(slug),
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationItem[]>('/notifications'),
    enabled,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<null>('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.clear(),
  });
}
