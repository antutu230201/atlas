'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, Card, CardContent, EmptyState, Skeleton, useToast } from '@atlas/ui';
import { api } from '@/lib/api';
import type { ModulePageProps, NoteRow } from './types';

/** 笔记回收站：恢复软删除笔记，永久删除需二次确认。 */
export function SampleNoteTrashPage({ workspaceSlug, moduleName }: ModulePageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;
  const trash = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'trash'],
    queryFn: ({ signal }) =>
      api<{ notes: NoteRow[] }>(`${base}/listTrash`, { method: 'POST', signal }),
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
      toast({ title: '笔记已恢复', variant: 'ok' });
    },
    onError: (error: Error) =>
      toast({ title: '恢复失败', description: error.message, variant: 'err' }),
  });
  const purge = useMutation({
    mutationFn: (id: string) => api(`${base}/purge`, { method: 'POST', json: { id } }),
    onSuccess: () => {
      invalidate();
      toast({ title: '笔记已永久删除', variant: 'ok' });
    },
    onError: (error: Error) =>
      toast({ title: '永久删除失败', description: error.message, variant: 'err' }),
  });

  const notes = trash.data?.notes ?? [];
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">笔记回收站</h1>
        <p className="screen-label mt-1 !text-[10px]">Notes · Trash</p>
        <a className="text-xs text-primary hover:underline" href={`/m/${moduleName}/list`}>
          返回笔记
        </a>
      </header>
      {trash.isPending ? (
        <div className="space-y-3" aria-label="正在加载笔记回收站">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
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
      ) : notes.length === 0 ? (
        <EmptyState title="回收站是空的" description="删除的笔记会暂存在这里，可随时恢复。" />
      ) : (
        <>
          <p className="text-sm text-muted">笔记删除后会保留在回收站；永久删除前可以随时恢复。</p>
          {notes.map((note) => {
            const confirming = confirmingId === note.id;
            return (
              <Card key={note.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm line-through">{note.title}</p>
                    <p className="text-xs text-muted">
                      删除于{' '}
                      {note.deletedAt ? new Date(note.deletedAt).toLocaleString('zh-CN') : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={restore.isPending || purge.isPending}
                      loading={restore.isPending && restore.variables === note.id}
                      onClick={() => restore.mutate(note.id)}
                    >
                      恢复
                    </Button>
                    <Button
                      size="sm"
                      variant={confirming ? 'primary' : 'ghost'}
                      disabled={restore.isPending || purge.isPending}
                      loading={purge.isPending && purge.variables === note.id}
                      aria-label={
                        confirming ? `确认永久删除 ${note.title}` : `永久删除 ${note.title}`
                      }
                      onClick={() => {
                        if (confirming) {
                          setConfirmingId(null);
                          purge.mutate(note.id);
                        } else {
                          setConfirmingId(note.id);
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
