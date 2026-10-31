'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, EmptyState, Skeleton } from '@atlas/ui';
import { api } from '@/lib/api';
import type { ModulePageProps, TodoRow } from './types';

/** 回收站：恢复 / 永久删除 */
export function TodoTrashPage({ workspaceSlug, moduleName }: ModulePageProps) {
  const queryClient = useQueryClient();
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;
  const trash = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'trash'],
    queryFn: () => api<{ todos: TodoRow[] }>(`${base}/listTrash`, { method: 'POST' }),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['module', moduleName, workspaceSlug] });

  const restore = useMutation({
    mutationFn: (id: string) => api(`${base}/restore`, { method: 'POST', json: { id } }),
    onSuccess: invalidate,
  });

  const purge = useMutation({
    mutationFn: (id: string) => api(`${base}/purge`, { method: 'POST', json: { id } }),
    onSuccess: invalidate,
  });

  const todos = trash.data?.todos ?? [];

  if (trash.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EmptyState title="回收站是空的" description="删除的待办会在这里保留，可随时恢复。" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <p className="text-sm text-muted">回收站中的待办不会出现在列表里，可恢复或永久删除。</p>
      {todos.map((row) => (
        <Card key={row.id}>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm line-through">{row.title}</p>
              <p className="text-xs text-muted">
                删除于 {row.deletedAt ? new Date(row.deletedAt).toLocaleString('zh-CN') : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" onClick={() => restore.mutate(row.id)}>
                恢复
              </Button>
              <Button size="sm" variant="ghost" onClick={() => purge.mutate(row.id)}>
                永久删除
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
