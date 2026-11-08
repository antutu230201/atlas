'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardContent, EmptyState, Skeleton } from '@atlas/ui';
import { api } from '@/lib/api';
import { useNotifications, type NotificationItem } from '@/lib/queries';

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
  const notifications = useNotifications();
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
  });

  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate,
  });

  // 服务端游标分页：切换类型回到第一页；未读数取全量缓存（导航铃铛同一份）
  const listQuery = useInfiniteQuery({
    queryKey: ['notifications', 'list', typeFilter],
    queryFn: ({ pageParam }) =>
      api<{ items: NotificationItem[]; nextCursor: string | null }>(
        `/notifications?limit=20${typeFilter === 'all' ? '' : `&type=${typeFilter}`}${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const all = notifications.data ?? [];
  const unread = all.filter((n) => n.readAt === null).length;
  const rows = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const items = filter === 'unread' ? rows.filter((n) => n.readAt === null) : rows;
  const hasMore = listQuery.hasNextPage;
  const loadingMore = listQuery.isFetchingNextPage;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">通知</h1>
          <p className="screen-label mt-1 !text-[10px]">Atlas · Notifications</p>
          <p className="mt-1 text-sm text-muted">
            {unread > 0 ? `${unread} 条未读` : all.length > 0 ? '全部已读' : '还没有收到通知'}
          </p>
        </div>
        {unread > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
            全部已读
          </Button>
        ) : null}
      </header>

      {all.length > 0 ? (
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
              checked={filter === 'unread'}
              onChange={(event) => changeFilter(event.target.checked ? 'unread' : 'all')}
            />
            只看未读{unread > 0 ? `（${unread}）` : ''}
          </label>
        </div>
      ) : null}

      {listQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
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
          {items.map((n) => {
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
                    {text ? <p className="mt-1.5 text-sm text-muted">{text}</p> : null}
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
                            if (n.readAt === null) markRead.mutate(n.id);
                          }}
                        >
                          下载当期报告
                        </Link>
                      </Button>
                    ) : null}
                    {n.readAt === null ? (
                      <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                        标为已读
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {hasMore && items.length > 0 ? (
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
