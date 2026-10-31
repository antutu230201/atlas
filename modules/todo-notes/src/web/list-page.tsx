'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Input, Skeleton } from '@atlas/ui';
import { api } from '@/lib/api';
import type { ModulePageProps, TodoRow } from './types';

/** 待办列表：创建/状态流转/筛选/搜索/删除（软删进回收站） */
export function TodoListPage({ workspaceSlug, moduleName }: ModulePageProps) {
  const queryClient = useQueryClient();
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;
  const [title, setTitle] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'list', statusFilter, search],
    queryFn: () =>
      api<{ todos: TodoRow[] }>(`${base}/list`, {
        method: 'POST',
        json: { status: statusFilter || undefined, q: search || undefined },
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['module', moduleName, workspaceSlug] });
  };

  const create = useMutation({
    mutationFn: () => api(`${base}/create`, { method: 'POST', json: { title } }),
    onSuccess: () => {
      setTitle('');
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: 'open' | 'doing' | 'done' }) =>
      api(`${base}/setStatus`, { method: 'POST', json: input }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/remove`, { method: 'POST', json: { id } }),
    onSuccess: invalidate,
  });

  const todos = list.data?.todos ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && title.trim().length > 0) create.mutate();
            }}
            placeholder="新待办，回车快速添加…"
            aria-label="新待办标题"
          />
          <Button
            loading={create.isPending}
            disabled={title.trim().length === 0}
            onClick={() => {
              create.mutate();
            }}
          >
            添加
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {['', 'open', 'doing', 'done'].map((status) => (
          <Button
            key={status || 'all'}
            size="sm"
            variant={statusFilter === status ? 'primary' : 'secondary'}
            onClick={() => setStatusFilter(status)}
          >
            {status === ''
              ? '全部'
              : status === 'open'
                ? '待办'
                : status === 'doing'
                  ? '进行中'
                  : '已完成'}
          </Button>
        ))}
        <div className="ml-auto w-44">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索标题…"
            aria-label="搜索标题"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-sm bg-err-soft px-3 py-2 text-xs text-err" role="alert">
          {error}
        </p>
      ) : null}

      {list.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : todos.length === 0 ? (
        <EmptyState title="这里空空如也" description="添加第一条待办，或者调整筛选条件。" />
      ) : (
        <div className="space-y-2">
          {todos.map((row: TodoRow) => (
            <Card key={row.id} className="py-3">
              <CardContent className="flex items-center gap-3 py-1">
                <div className="flex gap-1">
                  {(['open', 'doing', 'done'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-label={`设为 ${s}`}
                      onClick={() => setStatus.mutate({ id: row.id, status: s })}
                      className={cnStatus(row.status, s)}
                    >
                      {s === 'open' ? '待办' : s === 'doing' ? '进行' : '完成'}
                    </button>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      row.status === 'done' ? 'text-sm text-muted line-through' : 'text-sm'
                    }
                  >
                    {row.title}
                  </p>
                  {row.dueDate ? (
                    <p className="text-xs text-muted">
                      截止 {new Date(row.dueDate).toLocaleDateString('zh-CN')}
                    </p>
                  ) : null}
                </div>
                <Badge
                  variant={
                    row.priority === 'high' ? 'err' : row.priority === 'normal' ? 'neutral' : 'info'
                  }
                >
                  {row.priority}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(row.id)}>
                  删除
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function cnStatus(current: string, target: string): string {
  const base = 'rounded-xs px-1.5 py-0.5 text-[11px] transition-colors';
  if (current === target) {
    return target === 'done'
      ? `${base} bg-ok-soft text-ok`
      : target === 'doing'
        ? `${base} bg-primary-soft text-primary`
        : `${base} bg-border text-muted`;
  }
  return `${base} text-muted hover:bg-surface-hover hover:text-text`;
}
