'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, Card, CardContent, EmptyState, Skeleton, useToast } from '@atlas/ui';
import { api } from '@/lib/api';
import type { ModulePageProps, TodoRow } from './types';

/** 回收站：恢复 / 永久删除 */
export function TodoTrashPage({ workspaceSlug, moduleName }: ModulePageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;
  const trash = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'trash'],
    queryFn: ({ signal }) =>
      api<{ todos: TodoRow[] }>(`${base}/listTrash`, { method: 'POST', signal }),
  });

  useEffect(() => {
    if (!confirmingId) return;
    const timer = window.setTimeout(() => setConfirmingId(null), 3_000);
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmingId(null);
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', cancelOnEscape);
    };
  }, [confirmingId]);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['module', moduleName, workspaceSlug] });

  const restore = useMutation({
    mutationFn: (id: string) => api(`${base}/restore`, { method: 'POST', json: { id } }),
    onSuccess: () => {
      invalidate();
      toast({ title: '待办已恢复', variant: 'ok' });
    },
    onError: (error: Error) =>
      toast({ title: '恢复失败', description: error.message, variant: 'err' }),
  });

  const purge = useMutation({
    mutationFn: (id: string) => api(`${base}/purge`, { method: 'POST', json: { id } }),
    onSuccess: () => {
      invalidate();
      toast({ title: '待办已永久删除', variant: 'ok' });
    },
    onError: (error: Error) =>
      toast({ title: '永久删除失败', description: error.message, variant: 'err' }),
  });

  const todos = trash.data?.todos ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">回收站</h1>
        <p className="screen-label mt-1 !text-[10px]">Todo · Trash</p>
      </header>
      {trash.isPending ? (
        <div className="space-y-3" aria-label="正在加载回收站">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : trash.isError ? (
        <Card role="alert">
          <CardContent className="space-y-3 py-5">
            <p className="text-sm text-err">
              回收站加载失败：{trash.error instanceof Error ? trash.error.message : '请重试'}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void trash.refetch()}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      ) : todos.length === 0 ? (
        <EmptyState title="回收站是空的" description="删除的待办会在这里保留，可随时恢复。" />
      ) : (
        <>
          <p className="text-sm text-muted">回收站中的待办不会出现在列表里，可恢复或永久删除。</p>
          {todos.map((row) => {
            const confirming = confirmingId === row.id;
            return (
              <Card key={row.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm line-through">{row.title}</p>
                    <p className="text-xs text-muted">
                      删除于 {row.deletedAt ? new Date(row.deletedAt).toLocaleString('zh-CN') : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={restore.isPending && restore.variables === row.id}
                      disabled={restore.isPending || purge.isPending}
                      onClick={() => restore.mutate(row.id)}
                    >
                      恢复
                    </Button>
                    <Button
                      size="sm"
                      variant={confirming ? 'primary' : 'ghost'}
                      loading={purge.isPending && purge.variables === row.id}
                      disabled={restore.isPending || purge.isPending}
                      aria-label={
                        confirming ? `确认永久删除 ${row.title}` : `永久删除 ${row.title}`
                      }
                      onClick={() => {
                        if (confirming) {
                          setConfirmingId(null);
                          purge.mutate(row.id);
                        } else {
                          setConfirmingId(row.id);
                        }
                      }}
                    >
                      {confirming ? '确认删除？' : '永久删除'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
