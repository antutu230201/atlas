'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ScreenIcon } from './icons';

/**
 * 大屏"今日听歌"卡：只保留今日分钟、本周合计与最近在听，点击进统计页。
 * 数据与统计页同源（listeningSummary）；完全无数据时隐藏不占位。
 *
 * 2026-11 收敛：去掉 7 天柱状图与周几标签——首屏三列里它是窄卡，
 * 只需要回答"今天听了多久"，趋势留给统计页。
 */

interface SummaryPayload {
  totalSeconds: number;
  buckets: Array<{ label: string; seconds: number }>;
  topSongs: Array<{ songId: number; title: string; artist: string; seconds: number }>;
}

function shortDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
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

  const todayMinutes = Math.round(todaySeconds / 60);
  const activeDays = buckets.filter((bucket) => bucket.seconds > 0).length;
  const topSong = summary.topSongs?.[0];

  return (
    <Link
      href="/m/dashboard/listening"
      className="screen-card flex h-full flex-col justify-between gap-4 p-4 transition-colors hover:border-primary/40"
      aria-label={`今日听歌 ${todayMinutes} 分钟，查看听歌统计`}
      data-testid="listening-mini-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-xs border border-primary/20 bg-primary-soft text-primary">
            <ScreenIcon name="music" className="size-3.5" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold leading-4">今日听歌</h2>
            <p className="screen-label !text-[9px] !tracking-[0.16em]">Listening · Today</p>
          </div>
        </div>
        <span className="font-mono text-[10px] tracking-wider text-muted/70">STATS →</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-2">
        <p className="flex items-baseline gap-1.5">
          <span className="font-mono text-[48px] font-semibold leading-none tabular-nums">
            {todayMinutes}
          </span>
          <span className="text-xs font-medium text-muted">分钟</span>
        </p>
        <p className="text-[11px] text-muted">
          本周{' '}
          <span className="font-mono font-semibold text-text">{shortDuration(weekSeconds)}</span>
          <span className="mx-1.5 opacity-40">/</span>
          {activeDays} 天在听
        </p>
      </div>

      <p className="truncate border-t border-border/60 pt-2 text-[11px] text-muted">
        {topSong ? (
          <>
            <span className="text-muted/70">最近在听</span>
            <span className="ml-1.5 text-text">{topSong.title}</span>
            <span className="ml-1">· {topSong.artist}</span>
          </>
        ) : (
          '还没有播放记录'
        )}
      </p>
    </Link>
  );
}
