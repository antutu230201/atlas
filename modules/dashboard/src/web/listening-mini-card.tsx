'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ScreenIcon } from './icons';

/**
 * 大屏"今日听歌"紧凑卡（成长打卡卡的姊妹卡）：
 * 今日分钟数 + 近 7 天迷你柱（每格有可见轨道，今天高亮），底部本周合计，点击进听歌统计。
 * 数据与统计页同源（listeningSummary）；完全无数据时隐藏不占位。
 */

interface SummaryPayload {
  totalSeconds: number;
  buckets: Array<{ label: string; seconds: number }>;
}

export function ListeningMiniCard({ base }: { base: string }) {
  const query = useQuery({
    queryKey: ['dashboard', 'listening-summary', 'week'],
    queryFn: () =>
      api<SummaryPayload>(`${base}/listeningSummary`, { method: 'POST', json: { range: 'week' } }),
    staleTime: 60_000,
    retry: false,
  });

  const summary = query.data;
  if (!summary) return null;
  const buckets = summary.buckets.slice(-7);
  if (buckets.length === 0) return null;
  const todaySeconds = buckets.at(-1)?.seconds ?? 0;
  const weekSeconds = summary.totalSeconds;
  if (todaySeconds === 0 && weekSeconds === 0) return null;
  const maxSeconds = Math.max(60, ...buckets.map((bucket) => bucket.seconds));
  const minutes = Math.max(1, Math.round(todaySeconds / 60));
  const weekMinutes = Math.max(1, Math.round(weekSeconds / 60));

  return (
    <Link
      href="/m/dashboard/listening"
      className="screen-card block p-4 transition-colors hover:border-primary/40"
      aria-label={`今日听歌 ${minutes} 分钟，查看听歌统计`}
      data-testid="listening-mini-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="screen-label !text-[10px]">今日听歌</span>
        <ScreenIcon name="music" className="size-3.5 text-primary" />
      </div>
      <p className="mt-2 font-mono text-[26px] font-semibold leading-7 tabular-nums">
        {minutes}
        <span className="ml-1 text-xs font-medium text-muted">分钟</span>
      </p>
      {/* 近 7 天迷你柱：每格有可见轨道（与成长打卡热力图同语言），今天高亮 */}
      <div className="mt-3 flex h-9 items-end gap-1.5" aria-hidden>
        {buckets.map((bucket, index) => {
          const isToday = index === buckets.length - 1;
          const height = bucket.seconds > 0 ? Math.max(14, (bucket.seconds / maxSeconds) * 100) : 0;
          return (
            <div
              key={bucket.label}
              className={`flex h-full min-w-0 flex-1 items-end overflow-hidden rounded-xs ${
                isToday ? 'bg-primary-soft' : 'bg-border/30'
              }`}
              title={bucket.label}
            >
              <div
                className={`w-full rounded-xs transition-[height] duration-base ${
                  isToday ? 'bg-primary' : 'bg-primary/40'
                }`}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 flex items-center justify-between text-[11px] text-muted">
        <span>本周 {weekMinutes} 分钟</span>
        <span className="font-mono text-[10px] tracking-wider text-muted/70">STATS →</span>
      </p>
    </Link>
  );
}
