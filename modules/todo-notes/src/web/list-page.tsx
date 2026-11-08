'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, Input, Skeleton, useToast } from '@atlas/ui';
import { api } from '@/lib/api';
import type { ModulePageProps, TodoRow } from './types';

const STATUSES = ['open', 'doing', 'done'] as const;
type TodoStatus = (typeof STATUSES)[number];

const STATUS_LABELS: Record<TodoStatus, string> = {
  open: '待办',
  doing: '进行中',
  done: '已完成',
};

/** 待办列表：创建/状态流转/筛选/搜索/删除（软删进回收站）；看板视图支持拖拽换列 */
export function TodoListPage({ workspaceSlug, moduleName }: ModulePageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;
  const [title, setTitle] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  // 视图偏好存 localStorage：上次用看板，下次打开还是看板
  const [view, setView] = useState<'list' | 'board'>(() => {
    try {
      return window.localStorage.getItem('atlas.todo.view') === 'board' ? 'board' : 'list';
    } catch {
      return 'list';
    }
  });

  const changeView = (next: 'list' | 'board') => {
    setView(next);
    try {
      window.localStorage.setItem('atlas.todo.view', next);
    } catch {
      // 忽略
    }
  };
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [
      'module',
      moduleName,
      workspaceSlug,
      'list',
      view === 'board' ? '' : statusFilter,
      debouncedSearch,
    ],
    queryFn: ({ signal }) =>
      api<{ todos: TodoRow[] }>(`${base}/list`, {
        method: 'POST',
        signal,
        json: {
          // 看板需要三列全量，状态由前端分组
          status: view === 'board' ? undefined : statusFilter || undefined,
          q: debouncedSearch || undefined,
        },
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
      toast({ title: '已添加', variant: 'ok' });
    },
    onError: (e: Error) => {
      setError(e.message);
      toast({ title: '添加失败', description: e.message, variant: 'err' });
    },
  });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: TodoStatus }) =>
      api(`${base}/setStatus`, { method: 'POST', json: input }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: '状态更新失败', description: e.message, variant: 'err' }),
  });

  const setDue = useMutation({
    mutationFn: (input: { id: string; dueDate: string | null }) =>
      api(`${base}/update`, { method: 'POST', json: input }),
    onSuccess: invalidate,
    onError: (e: Error) =>
      toast({ title: '截止日期更新失败', description: e.message, variant: 'err' }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/remove`, { method: 'POST', json: { id } }),
    onSuccess: () => {
      invalidate();
      toast({ title: '已移入回收站', variant: 'info' });
    },
    onError: (e: Error) =>
      toast({ title: '移入回收站失败', description: e.message, variant: 'err' }),
  });

  const todos = list.data?.todos ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">待办</h1>
        <p className="screen-label mt-1 !text-[10px]">Todo · Capture and organize</p>
      </header>
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
        <div
          className="flex items-center gap-0.5 rounded-sm border border-border p-0.5"
          role="group"
          aria-label="视图切换"
        >
          {(
            [
              { key: 'list', label: '列表' },
              { key: 'board', label: '看板' },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={view === option.key}
              onClick={() => changeView(option.key)}
              className={`rounded-xs px-3 py-1 text-xs font-semibold transition-colors ${
                view === option.key ? 'bg-primary-soft text-primary' : 'text-muted hover:text-text'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {view === 'list'
          ? ['' as const, ...STATUSES].map((status) => (
              <Button
                key={status || 'all'}
                size="sm"
                aria-pressed={statusFilter === status}
                variant={statusFilter === status ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter(status)}
              >
                {status === '' ? '全部' : STATUS_LABELS[status]}
              </Button>
            ))
          : null}
        <div className="ml-auto w-full sm:w-56">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索标题…"
            aria-label="搜索标题"
          />
        </div>
      </div>

      {list.isFetching && list.data ? (
        <p className="text-xs text-muted" role="status" aria-live="polite">
          正在更新列表…
        </p>
      ) : null}
      {list.isError && list.data ? (
        <p className="text-sm text-err" role="alert">
          刷新失败：{list.error instanceof Error ? list.error.message : '请重试'}
          <button type="button" className="ml-2 underline" onClick={() => void list.refetch()}>
            重试
          </button>
        </p>
      ) : null}

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
      ) : list.isError && !list.data ? (
        <div className="screen-card space-y-3 p-6 text-center" role="alert">
          <p className="text-sm text-err">
            待办列表加载失败：{list.error instanceof Error ? list.error.message : '请重试'}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
            重新加载
          </Button>
        </div>
      ) : todos.length === 0 ? (
        <EmptyState
          title={debouncedSearch || statusFilter ? '没有匹配的待办' : '还没有待办'}
          description={
            debouncedSearch || statusFilter
              ? '尝试调整关键词或状态筛选。'
              : '把接下来要做的事记下来，回车即可快速添加。'
          }
        />
      ) : view === 'board' ? (
        <>
          <p className="text-xs text-muted">拖动卡片切换状态；聚焦卡片后也可按左右方向键移动。</p>
          <TodoBoard
            todos={todos}
            onMove={(id, status) => setStatus.mutate({ id, status })}
            onRemove={(id) => remove.mutate(id)}
            onSetDue={(d, id) => setDue.mutate({ id, dueDate: d })}
            moving={setStatus.isPending || setDue.isPending}
          />
        </>
      ) : (
        <div className="space-y-2">
          {todos.map((row: TodoRow) => (
            <Card key={row.id} className="py-3">
              <CardContent className="flex items-center gap-3 py-1">
                <div className="flex gap-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-label={`设为${STATUS_LABELS[s]}`}
                      aria-pressed={row.status === s}
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: row.id, status: s })}
                      className={cnStatus(row.status, s)}
                    >
                      {STATUS_LABELS[s].slice(0, 2)}
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
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    {row.dueDate ? (
                      <>截止 {new Date(row.dueDate).toLocaleDateString('zh-CN')}</>
                    ) : (
                      '未设置截止'
                    )}
                    <DueQuick
                      disabled={setDue.isPending}
                      onSet={(d) => setDue.mutate({ id: row.id, dueDate: d })}
                    />
                  </p>
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

/** 看板视图：三列按状态分组，HTML5 原生拖拽换列（不引第三方库） */
function TodoBoard({
  todos,
  onMove,
  onRemove,
  onSetDue,
  moving,
}: {
  todos: TodoRow[];
  onMove: (id: string, status: TodoStatus) => void;
  onRemove: (id: string) => void;
  onSetDue: (dueDate: string | null, id: string) => void;
  moving: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TodoStatus | null>(null);

  const columns = STATUSES.map((status) => ({
    status,
    rows: todos.filter((row) => row.status === status),
  }));

  return (
    <div className="grid gap-3 md:grid-cols-3" aria-label="待办看板">
      {columns.map(({ status, rows }) => (
        <div
          key={status}
          onDragOver={(event) => {
            event.preventDefault();
            setOverColumn(status);
          }}
          onDragLeave={() => setOverColumn((current) => (current === status ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            setOverColumn(null);
            if (dragId) onMove(dragId, status);
            setDragId(null);
          }}
          className={`flex min-h-40 flex-col gap-2 rounded-md border p-3 transition-colors ${
            overColumn === status
              ? 'border-primary/50 bg-primary-soft/40'
              : 'border-border bg-surface/40'
          }`}
          aria-label={`${STATUS_LABELS[status]}列，${rows.length} 条`}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold">{STATUS_LABELS[status]}</span>
            <span className="font-mono text-[10px] text-muted tabular-nums">{rows.length}</span>
          </div>

          {rows.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-[11px] text-muted/60">
              {moving ? '移动中…' : '拖到这里'}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                draggable
                tabIndex={0}
                role="group"
                aria-label={`${row.title}，${STATUS_LABELS[row.status]}。按左右方向键切换状态`}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  const currentIndex = STATUSES.indexOf(row.status);
                  const nextIndex = currentIndex + (event.key === 'ArrowRight' ? 1 : -1);
                  const nextStatus = STATUSES[nextIndex];
                  if (!nextStatus) return;
                  event.preventDefault();
                  onMove(row.id, nextStatus);
                }}
                onDragStart={() => setDragId(row.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverColumn(null);
                }}
                className={`cursor-grab rounded-sm border border-border bg-surface p-2.5 shadow-soft transition-opacity active:cursor-grabbing ${
                  dragId === row.id ? 'opacity-40' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`min-w-0 flex-1 text-[13px] leading-5 ${
                      row.status === 'done' ? 'text-muted line-through' : ''
                    }`}
                  >
                    {row.title}
                  </p>
                  <Badge
                    variant={
                      row.priority === 'high'
                        ? 'err'
                        : row.priority === 'normal'
                          ? 'neutral'
                          : 'info'
                    }
                  >
                    {row.priority}
                  </Badge>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                  <span className="flex items-center gap-1">
                    {row.dueDate
                      ? `截止 ${new Date(row.dueDate).toLocaleDateString('zh-CN')}`
                      : '未设置截止'}
                    <DueQuick disabled={moving} onSet={(d) => onSetDue(d, row.id)} />
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    className="transition-colors hover:text-err"
                    aria-label={`删除 ${row.title}`}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

/** 截止日快捷设置：今天 / 明天 / 下周，已设置时可清除 */
function DueQuick({
  onSet,
  disabled = false,
}: {
  onSet: (d: string | null) => void;
  disabled?: boolean;
}) {
  const fmt = (offset: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const items: Array<[string, number]> = [
    ['今', 0],
    ['明', 1],
    ['周', 7],
  ];
  return (
    <span className="inline-flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
      {items.map(([label, offset]) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          title={offset === 0 ? '截止今天' : offset === 1 ? '截止明天' : '截止下周同一天'}
          onClick={() => onSet(fmt(offset))}
          className="rounded-xs border border-border px-1 leading-4 transition-colors hover:border-primary/40 hover:text-primary"
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        title="清除截止日"
        onClick={() => onSet(null)}
        className="rounded-xs px-0.5 leading-4 transition-colors hover:text-err"
      >
        ✕
      </button>
    </span>
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
