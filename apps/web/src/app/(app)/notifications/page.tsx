'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardContent, EmptyState, Skeleton, useToast } from '@atlas/ui';
import { api } from '@/lib/api';
import { useUnreadNotificationCount, type NotificationItem } from '@/lib/queries';

/** 通知正文与跳转目标由服务端写入 body（如周报的 text / link），这里只做类型守卫后渲染 */
function readBodyText(body: Record<string, unknown>): string | null {
  return typeof body.text === 'string' && body.text.trim() ? body.text : null;
}

function readBodyLink(body: Record<string, unknown>): string | null {
  return typeof body.link === 'string' && body.link.startsWith('/') ? body.link : null;
}

/** 相对时间：通知越新越该一眼看出，精确到分钟；跨年才显示年份 */
function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minute = 60_000;
  if (diff < minute) return '刚刚';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
  const date = new Date(then);
  const md = `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  return date.getFullYear() === new Date().getFullYear() ? md : `${date.getFullYear()} 年 ${md}`;
}

export default function NotificationsPage() {
  const unreadCountQuery = useUnreadNotificationCount();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // 筛选偏好存 localStorage：刷新后保持，不进 URL（个人页面无分享诉求）
  const [filter, setFilter] = useState<'all' | 'unread'>(() => {
    try {
      const saved = window.localStorage.getItem('atlas.notifications.unreadOnly');
      return saved === '1' ? 'unread' : 'all';
    } catch {
      return 'all';
    }
  });
  const [typeFilter, setTypeFilter] = useState<'all' | 'listening' | 'system'>(() => {
    try {
      const saved = window.localStorage.getItem('atlas.notifications.typeFilter');
      if (saved === 'listening' || saved === 'system') return saved;
    } catch {
      // 忽略隐私模式
    }
    return 'all';
  });

  const changeFilter = (next: 'all' | 'unread') => {
    setFilter(next);
    try {
      window.localStorage.setItem('atlas.notifications.unreadOnly', next === 'unread' ? '1' : '0');
    } catch {
      // 忽略
    }
  };

  const changeTypeFilter = (next: 'all' | 'listening' | 'system') => {
    setTypeFilter(next);
    try {
      window.localStorage.setItem('atlas.notifications.typeFilter', next);
    } catch {
      // 忽略
    }
  };

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (error: Error) =>
      toast({ title: '标记已读失败', description: error.message, variant: 'err' }),
  });

  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      toast({ title: '所有通知已标记为已读', variant: 'ok' });
    },
    onError: (error: Error) =>
      toast({ title: '全部已读失败', description: error.message, variant: 'err' }),
  });

  // 服务端游标分页；未读筛选和精确计数由服务端执行，避免只检查已加载页面。
  const listQuery = useInfiniteQuery({
    queryKey: ['notifications', 'list', typeFilter, filter],
    queryFn: ({ pageParam, signal }) =>
      api<{ items: NotificationItem[]; nextCursor: string | null }>(
        `/notifications?limit=20${typeFilter === 'all' ? '' : `&type=${typeFilter}`}${filter === 'unread' ? '&unread=true' : ''}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const unread = unreadCountQuery.data ?? 0;
  const rows = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  // 未读在上，已读默认折叠（防止已读堆淹没新通知）；「只看未读」时已读组不显示
  const unreadItems = rows.filter((n) => n.readAt === null);
  const readItems = rows.filter((n) => n.readAt !== null);
  const [readExpanded, setReadExpanded] = useState(false);
  useEffect(() => setReadExpanded(false), [filter, typeFilter]);
  const hasMore = listQuery.hasNextPage;
  const loadingMore = listQuery.isFetchingNextPage;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">通知</h1>
          <p className="screen-label mt-1 !text-[10px]">Atlas · Notifications</p>
          <p className="mt-1 text-sm text-muted">
            {unreadCountQuery.isError
              ? '未读数量暂时无法获取'
              : unread > 0
                ? `${unread} 条未读`
                : rows.length > 0
                  ? '全部已读'
                  : typeFilter === 'all'
                    ? '还没有收到通知'
                    : '当前分类没有通知'}
          </p>
        </div>
        {unread > 0 ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            confirmText="确认全部已读？"
            loading={markAll.isPending}
            onConfirm={() => markAll.mutate()}
          >
            全部已读
          </ConfirmButton>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="通知筛选">
        {(
          [
            { key: 'all', label: '全部' },
            { key: 'listening', label: '听歌周报' },
            { key: 'system', label: '系统' },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={typeFilter === option.key}
            onClick={() => changeTypeFilter(option.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              typeFilter === option.key
                ? 'border-primary/40 bg-primary-soft text-primary'
                : 'border-border bg-surface/60 text-muted hover:text-text'
            }`}
          >
            {option.label}
          </button>
        ))}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            className="size-3.5 accent-[var(--primary)]"
            aria-label="只看未读"
            checked={filter === 'unread'}
            onChange={(event) => changeFilter(event.target.checked ? 'unread' : 'all')}
          />
          只看未读{unread > 0 ? `（${unread}）` : ''}
        </label>
      </div>

      {listQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : listQuery.isError && !listQuery.data ? (
        <Card role="alert">
          <CardContent className="space-y-3 py-5">
            <p className="text-sm text-err">
              通知加载失败：{listQuery.error instanceof Error ? listQuery.error.message : '请重试'}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void listQuery.refetch()}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            filter === 'unread'
              ? '没有未读通知'
              : typeFilter === 'listening'
                ? '还没有听歌周报'
                : typeFilter === 'system'
                  ? '没有系统通知'
                  : '暂无通知'
          }
          description={
            filter === 'unread'
              ? '都看完了，去干点别的吧。'
              : typeFilter === 'listening'
                ? '每周一自动汇总上周听歌数据，生成后会出现在这里。'
                : '有新动态时会出现在这里。'
          }
        />
      ) : (
        <div className="space-y-3">
          {/* 未读永远全量显示在最前；已读默认只露最近 3 条，点开看更早的 */}
          {unreadItems.map((n) => renderRow(n, markRead.mutate, markRead.isPending))}
          {filter === 'all' && readItems.length > 0 ? (
            <>
              {(readExpanded ? readItems : readItems.slice(0, VISIBLE_READ)).map((n) =>
                renderRow(n, markRead.mutate, markRead.isPending),
              )}
              <button
                type="button"
                onClick={() => setReadExpanded((value) => !value)}
                className="w-full rounded-sm border border-dashed border-border py-2.5 text-xs text-muted transition-colors hover:border-primary/40 hover:text-text"
              >
                {readExpanded
                  ? '收起已读'
                  : `展开已读（${Math.max(0, readItems.length - VISIBLE_READ)} 条更早的）`}
              </button>
            </>
          ) : null}
        </div>
      )}

      {listQuery.isError && listQuery.data && !listQuery.isFetchNextPageError ? (
        <p className="text-center text-sm text-err" role="alert">
          通知刷新失败。{' '}
          <button type="button" className="underline" onClick={() => void listQuery.refetch()}>
            重试
          </button>
        </p>
      ) : null}

      {listQuery.isFetchNextPageError ? (
        <p className="text-center text-sm text-err" role="alert">
          加载更多失败。{' '}
          <button
            type="button"
            className="underline"
            onClick={() => void listQuery.fetchNextPage()}
          >
            重试
          </button>
        </p>
      ) : null}

      {hasMore && rows.length > 0 ? (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="secondary"
            loading={loadingMore}
            onClick={() => void listQuery.fetchNextPage()}
          >
            加载更多
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 二次确认按钮：第一次点击进入确认态（3s 无操作自动还原），
 * 避免「全部已读」这类不可逆操作被误触。不引额外弹窗依赖。
 */
function ConfirmButton({
  confirmText,
  onConfirm,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  confirmText: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3_000);
    return () => window.clearTimeout(timer);
  }, [confirming]);
  return (
    <Button
      {...props}
      variant={confirming ? 'primary' : props.variant}
      onClick={() => {
        if (confirming) {
          setConfirming(false);
          onConfirm();
        } else {
          setConfirming(true);
        }
      }}
    >
      {confirming ? confirmText : children}
    </Button>
  );
}

/** 已读折叠区默认露出的条数 */
const VISIBLE_READ = 3;

/**
 * 日报/周报正文 = 数据段 + AI 点评段（以「。」分隔，点评由调度器追加）。
 * 点评段用 ✦ 前缀与主色区分，让「机器说的话」一眼可辨；单段正文按原样渲染。
 */
function TextWithComment({ text }: { text: string }) {
  const segments = text.split('。').filter((part) => part.trim().length > 0);
  if (segments.length < 2) {
    return <p className="mt-1.5 text-sm text-muted">{text}</p>;
  }
  const data = `${segments[0]}。`;
  const comment = `${segments.slice(1).join('。')}。`;
  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-sm text-muted">{data}</p>
      <p className="flex items-start gap-1.5 text-sm text-primary/90">
        <span aria-hidden className="mt-px shrink-0 text-[11px]">
          ✦
        </span>
        <span>{comment}</span>
      </p>
    </div>
  );
}

/** 通知行卡片：未读描边 + 正文 + 相对时间 + 操作（下载报告 / 标为已读） */
function renderRow(
  n: NotificationItem,
  onMarkRead: (id: string) => void,
  markingRead: boolean,
): React.JSX.Element {
  const text = readBodyText(n.body);
  const link = readBodyLink(n.body);
  return (
    <Card key={n.id} className={n.readAt === null ? 'border-primary/40' : undefined}>
      <CardContent className="flex items-start justify-between gap-3 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {n.title}
            {n.readAt === null ? (
              <Badge variant="primary" className="ml-2">
                新
              </Badge>
            ) : null}
          </p>
          {text ? <TextWithComment text={text} /> : null}
          <p
            className="mt-1.5 text-xs text-muted"
            title={new Date(n.createdAt).toLocaleString('zh-CN')}
          >
            {relativeTime(n.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {link ? (
            <Button asChild size="sm" variant="secondary">
              <Link
                href={link}
                onClick={() => {
                  if (n.readAt === null) onMarkRead(n.id);
                }}
              >
                下载当期报告
              </Link>
            </Button>
          ) : null}
          {n.readAt === null ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={markingRead}
              onClick={() => onMarkRead(n.id)}
            >
              标为已读
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
