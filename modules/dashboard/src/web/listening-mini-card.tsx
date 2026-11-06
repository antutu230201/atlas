'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ScreenIcon } from './icons';

/**
 * 大屏"今日听歌"紧凑卡：今日分钟数 + 近 7 天迷你柱，点击进入完整听歌统计。
 * 数据与统计页同源（listeningSummary）；加载失败静默隐藏，不占大屏空间。
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
  const todaySeconds = summary.buckets.at(-1)?.seconds ?? 0;
  if (todaySeconds === 0 && summary.totalSeconds === 0) return null;
  const maxSeconds = Math.max(60, ...summary.buckets.map((bucket) => bucket.seconds));
  const minutes = Math.max(1, Math.round(todaySeconds / 60));

  return (
    <Link
      href="/m/dashboard/listening"
      className="screen-card block !p-4 transition-colors hover:border-primary/40"
      aria-label={`今日听歌 ${minutes} 分钟，查看听歌统计`}
      data-testid="listening-mini-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="screen-label !text-[10px]">今日听歌</span>
        <ScreenIcon name="music" className="size-3.5 text-primary" />
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
        {minutes}
        <span className="ml-1 text-xs font-medium text-muted">分钟</span>
      </p>
      <div className="mt-3 flex h-8 items-end gap-1" aria-hidden>
        {summary.buckets.map((bucket) => (
          <div
            key={bucket.label}
            className={`min-w-0 flex-1 rounded-xs ${bucket.seconds > 0 ? 'bg-primary/60' : 'bg-border/50'}`}
            style={{
              height: `${Math.max(bucket.seconds > 0 ? 15 : 3, (bucket.seconds / maxSeconds) * 100)}%`,
            }}
          />
        ))}
      </div>
    </Link>
  );
}
