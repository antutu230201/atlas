'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** 折叠预览的字符数：超过才显示“展开全文” */
const PREVIEW_LIMIT = 280;

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
        <VirtualNoteList
          notes={notes}
          expandedId={expandedId}
          removing={remove.isPending}
          // 列表上方的状态提示会改变列表起点，用它驱动偏移重算
          layoutKey={`${notes.length}:${list.isFetching}:${list.isError}`}
          onToggleExpand={(id) => setExpandedId((current) => (current === id ? null : id))}
          onRemove={(id) => remove.mutate(id)}
        />
      )}
    </div>
  );
}

/**
 * 窗口滚动虚拟列表：最多 100 篇笔记只挂载可视区域 + overscan 的行，
 * 行高由 measureElement 实测（标题换行、正文长度、展开状态都会改变高度）。
 */
function VirtualNoteList({
  notes,
  expandedId,
  removing,
  layoutKey,
  onToggleExpand,
  onRemove,
}: {
  notes: NoteRow[];
  expandedId: string | null;
  removing: boolean;
  layoutKey: string;
  onToggleExpand: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const getItemKey = useCallback((index: number) => notes[index]?.id ?? index, [notes]);
  // 初始估算值只影响首帧占位，实际高度以 measureElement 为准
  const estimateSize = useCallback(() => 180, []);
  const virtualizer = useWindowVirtualizer({
    count: notes.length,
    estimateSize,
    getItemKey,
    overscan: 6,
    gap: 12,
    scrollMargin,
    useFlushSync: false,
  });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measureOffset = () => setScrollMargin(list.getBoundingClientRect().top + window.scrollY);
    measureOffset();
    window.addEventListener('resize', measureOffset);
    return () => window.removeEventListener('resize', measureOffset);
  }, [notes, layoutKey]);

  // 删除成功后，被删行的按钮随行卸载，把焦点交给同位置（或上一行）的按钮，避免焦点回落到 body
  const pendingFocusIndex = useRef<number | null>(null);
  const lastCount = useRef(notes.length);
  useEffect(() => {
    const target = pendingFocusIndex.current;
    pendingFocusIndex.current = null;
    const shrank = notes.length < lastCount.current;
    lastCount.current = notes.length;
    if (target === null || !shrank) return;
    const container = listRef.current;
    if (!container) return;
    const row =
      container.querySelector<HTMLElement>(`[data-index="${target}"]`) ??
      container.querySelector<HTMLElement>(`[data-index="${target - 1}"]`);
    (row?.querySelector<HTMLElement>('button') ?? container).focus();
  }, [notes]);

  return (
    <div
      ref={listRef}
      role="list"
      aria-label="笔记列表"
      aria-busy={removing || undefined}
      tabIndex={-1}
      className="relative w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const row = notes[item.index];
        if (!row) return null;
        const expanded = expandedId === row.id;
        const canExpand = row.body.length > PREVIEW_LIMIT;
        return (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            data-testid="note-row"
            role="listitem"
            aria-posinset={item.index + 1}
            aria-setsize={notes.length}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="break-words">{row.title}</CardTitle>
                <IconButton
                  aria-label={`删除 ${row.title}`}
                  variant="ghost"
                  size="sm"
                  disabled={removing}
                  onClick={() => {
                    pendingFocusIndex.current = item.index;
                    onRemove(row.id);
                  }}
                >
                  ✕
                </IconButton>
              </CardHeader>
              {row.body ? (
                <CardContent className="space-y-1 text-muted">
                  <p className="break-words whitespace-pre-wrap">
                    {canExpand && !expanded ? `${row.body.slice(0, PREVIEW_LIMIT)}…` : row.body}
                  </p>
                  {canExpand ? (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      aria-expanded={expanded}
                      onClick={() => onToggleExpand(row.id)}
                    >
                      {expanded ? '收起' : '展开全文'}
                    </button>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          </div>
        );
      })}
    </div>
  );
}
