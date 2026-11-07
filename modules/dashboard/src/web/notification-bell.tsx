'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ScreenIcon } from './icons';

interface NotificationRow {
  id: string;
  readAt: string | null;
}

/**
 * 顶栏通知入口：未读角标让周报/系统消息在大屏也能被看见。
 * 用 /notifications?limit=50 统计未读——个人用量级足够，避免为一个数字新增接口。
 */
export function NotificationBell() {
  const query = useQuery({
    queryKey: ['notifications', 'screen-badge'],
    queryFn: () => api<NotificationRow[]>('/notifications?limit=50'),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    retry: false,
  });
  const unread = (query.data ?? []).filter((item) => item.readAt === null).length;

  return (
    <Link
      href="/notifications"
      className="screen-icon-button relative"
      aria-label={unread > 0 ? `通知，${unread} 条未读` : '通知'}
      title={unread > 0 ? `${unread} 条未读通知` : '通知'}
    >
      <ScreenIcon name="bell" className="size-3.5" />
      {unread > 0 ? (
        <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-err px-1 font-mono text-[10px] leading-4 font-semibold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
