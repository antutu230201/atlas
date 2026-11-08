'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ModulePageProps } from './types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  IconButton,
  Input,
  Skeleton,
  Textarea,
  useToast,
} from '@atlas/ui';
import { api } from '@/lib/api';
import type { NoteRow } from './types';

/** 示例模块页面：list / create / remove 三个动作经内核网关调用 */
export function SampleNoteListPage({ workspaceSlug, moduleName }: ModulePageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'list'],
    queryFn: ({ signal }) =>
      api<{ notes: NoteRow[] }>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/list`, {
        method: 'POST',
        signal,
      }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['module', moduleName, workspaceSlug] });

  const create = useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      api<NoteRow>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/create`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      setError(null);
      void invalidate();
      toast({ title: '笔记已保存', variant: 'ok' });
    },
    onError: (e: Error) => {
      setError(e.message);
      toast({ title: '保存失败', description: e.message, variant: 'err' });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api<{ removed: string }>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/remove`, {
        method: 'POST',
        json: { id },
      }),
    onSuccess: () => {
      void invalidate();
      toast({ title: '笔记已移入回收站', variant: 'ok' });
    },
    onError: (e: Error) => toast({ title: '删除失败', description: e.message, variant: 'err' }),
  });

  const notes = list.data?.notes ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">笔记</h1>
        <p className="screen-label mt-1 !text-[10px]">Notes · Write it down</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>新建笔记</CardTitle>
        </CardHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) create.mutate({ title: title.trim(), body });
          }}
        >
          <CardContent className="space-y-4">
            <Field id="note-title" label="标题" required error={error}>
              <Input
                id="note-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                placeholder="记录今天的一件小事…"
                maxLength={120}
              />
            </Field>
            <Field id="note-body" label="正文" hint="可选，最多 5000 字">
              <Textarea
                id="note-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="写点什么…"
                maxLength={5000}
                className="min-h-32"
              />
              <p className="text-right text-[11px] text-muted">{body.length}/5000</p>
            </Field>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={!title.trim() || create.isPending}
            >
              保存笔记
            </Button>
          </CardContent>
        </form>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">最近笔记</h2>
        <Button asChild size="sm" variant="secondary">
          <a href={`/m/${moduleName}/trash`}>回收站</a>
        </Button>
      </div>

      {list.isFetching && list.data ? (
        <p className="text-xs text-muted" role="status" aria-live="polite">
          正在更新笔记…
        </p>
      ) : null}
      {list.isError && list.data ? (
        <p className="text-sm text-err" role="alert">
          更新失败，当前显示的是上次结果。{' '}
          <button type="button" className="underline" onClick={() => void list.refetch()}>
            重试
          </button>
        </p>
      ) : null}

      {list.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.isError && !list.data ? (
        <Card role="alert">
          <CardContent className="space-y-3 py-5">
            <p className="text-sm text-err">
              笔记加载失败：{list.error instanceof Error ? list.error.message : '请重试'}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      ) : notes.length === 0 ? (
        <EmptyState title="还没有笔记" description="把今天值得记住的一件事写下来。" />
      ) : (
        <div className="space-y-3">
          {notes.map((row) => {
            const previewLimit = 280;
            const expanded = expandedId === row.id;
            const canExpand = row.body.length > previewLimit;
            return (
              <Card key={row.id}>
                <CardHeader>
                  <CardTitle className="break-words">{row.title}</CardTitle>
                  <IconButton
                    aria-label={`删除 ${row.title}`}
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(row.id)}
                  >
                    ✕
                  </IconButton>
                </CardHeader>
                {row.body ? (
                  <CardContent className="space-y-1 text-muted">
                    <p className="break-words whitespace-pre-wrap">
                      {canExpand && !expanded ? `${row.body.slice(0, previewLimit)}…` : row.body}
                    </p>
                    {canExpand ? (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        aria-expanded={expanded}
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                      >
                        {expanded ? '收起' : '展开全文'}
                      </button>
                    ) : null}
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
