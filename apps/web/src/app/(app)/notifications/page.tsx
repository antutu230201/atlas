'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardContent, EmptyState, Skeleton } from '@atlas/ui';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/queries';

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

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate,
  });

  const items = notifications.data ?? [];
  const unread = items.filter((n) => n.readAt === null).length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">通知</h1>
          <p className="screen-label mt-1 !text-[10px]">Atlas · Notifications</p>
          {unread > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {unread} 条未读
              <Button size="sm" variant="ghost" className="ml-3" onClick={() => markAll.mutate()}>
                全部已读
              </Button>
            </p>
          ) : null}
        </div>
      </header>

      {notifications.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="暂无通知" description="有新动态时会出现在这里。" />
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
    </div>
  );
}
