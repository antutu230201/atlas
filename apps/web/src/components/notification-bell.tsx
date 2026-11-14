'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuietHours, useUnreadNotificationCount } from '@/lib/queries';
import { isQuietNow } from '@/lib/quiet-hours';

/** 顶栏通知铃铛：显示未读数 badge；免打扰时段内角标静默为月亮标记（未读数保留在无障碍名里） */
export function NotificationBell() {
  const unreadQuery = useUnreadNotificationCount();
  const quietQuery = useQuietHours();
  const unread = unreadQuery.data ?? 0;
  const pref = quietQuery.data;

  // 免打扰启用时每分钟重估窗口（本地时钟判定，跨午夜安全）
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    if (!pref) return;
    const update = () => setQuiet(Boolean(pref.enabled) && isQuietNow(pref));
    update();
    if (!pref.enabled) return;
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [pref]);

  const quietActive = quiet && unread > 0;

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadQuery.isError
          ? '通知（未读数暂不可用）'
          : quietActive
            ? `通知（免打扰中，${unread} 条未读）`
            : unread > 0
              ? `通知（${unread} 条未读）`
              : '通知'
      }
      title={
        quietActive && pref
          ? `免打扰中（${pref.start} – ${pref.end}），${unread} 条未读`
          : undefined
      }
      className="relative rounded-sm px-2 py-1 text-sm text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      ✉
      {quietActive ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-1 flex size-4 items-center justify-center rounded-full border border-border bg-surface text-[9px] text-muted"
        >
          🌙
        </span>
      ) : unread > 0 ? (
        <span className="absolute -top-0.5 -right-1 flex size-4 items-center justify-center rounded-full bg-err text-[10px] font-bold text-on-err">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
