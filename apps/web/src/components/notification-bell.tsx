'use client';

import Link from 'next/link';
import { useNotifications } from '@/lib/queries';

/** 顶栏通知铃铛：显示未读数 badge，点击跳转通知页 */
export function NotificationBell() {
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => n.readAt === null).length;

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `通知（${unread} 条未读）` : '通知'}
      className="relative rounded-sm px-2 py-1 text-sm text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      ✉
      {unread > 0 ? (
        <span className="absolute -top-0.5 -right-1 flex size-4 items-center justify-center rounded-full bg-err text-[10px] font-bold text-on-err">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
