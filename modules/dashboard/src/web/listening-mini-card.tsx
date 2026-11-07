'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ScreenIcon } from './icons';

/**
 * 大屏"今日听歌"卡（与成长打卡卡同语言）：
 * 今日分钟数 → 近 7 天柱（每根带周几标签，今天高亮）→ 本周合计 + 最近在听的歌，点击进听歌统计。
 * 数据与统计页同源（listeningSummary）；完全无数据时隐藏不占位。
 *
 * 2026-11 改版：旧版柱子没有日期标签、也没有任何上下文（只有两个数字），
 * 在大屏上和旁边的打卡热力图相比像一张半成品卡；现补上周几、本周合计与 Top1 歌曲。
 */

interface SummaryPayload {
  totalSeconds: number;
  buckets: Array<{ label: string; seconds: number }>;
  topSongs: Array<{ songId: number; title: string; artist: string; seconds: number }>;
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function weekdayOf(label: string): string {
  const date = new Date(`${label}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : (WEEKDAY[date.getDay()] ?? '');
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

  const maxSeconds = Math.max(60, ...buckets.map((bucket) => bucket.seconds));
  const todayMinutes = Math.round(todaySeconds / 60);
  const topSong = summary.topSongs?.[0];
  const activeDays = buckets.filter((bucket) => bucket.seconds > 0).length;

  return (
    <Link
      href="/m/dashboard/listening"
      className="screen-card block p-4 transition-colors hover:border-primary/40 xl:flex xl:items-center xl:gap-6"
      aria-label={`今日听歌 ${todayMinutes} 分钟，查看听歌统计`}
      data-testid="listening-mini-card"
    >
      <div className="flex items-start justify-between gap-2 xl:w-40 xl:shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-xs border border-primary/20 bg-primary-soft text-primary">
            <ScreenIcon name="music" className="size-3.5" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold leading-4">今日听歌</h2>
            <p className="screen-label !text-[9px] !tracking-[0.16em]">Listening · 7 days</p>
          </div>
        </div>
        <span className="font-mono text-[10px] tracking-wider text-muted/70">STATS →</span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2 xl:mt-0 xl:w-48 xl:shrink-0">
        <p className="font-mono text-[22px] font-semibold leading-6 tabular-nums">
          {todayMinutes}
          <span className="ml-1 text-xs font-medium text-muted">分钟</span>
        </p>
        <p className="pb-0.5 text-right text-[11px] leading-4 text-muted">
          本周{' '}
          <span className="font-mono font-semibold text-text">{shortDuration(weekSeconds)}</span>
          <br />
          {activeDays} / 7 天在听
        </p>
      </div>

      <p className="mt-2 w-full truncate border-t border-border/60 pt-1.5 text-[10px] text-muted xl:mt-0 xl:w-52 xl:shrink-0 xl:border-r xl:border-t-0 xl:pr-5 xl:pt-0">
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

      {/* 近 7 天：每根柱有可见轨道 + 周几标签，今天用实色强调 */}
      <div
        className="mt-2 flex items-end gap-1.5 xl:mt-0 xl:min-w-0 xl:flex-1"
        role="img"
        aria-label="最近 7 天听歌时长"
      >
        {buckets.map((bucket, index) => {
          const isToday = index === buckets.length - 1;
          const height = bucket.seconds > 0 ? Math.max(12, (bucket.seconds / maxSeconds) * 100) : 0;
          return (
            <div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className={`mx-auto flex h-8 w-full max-w-10 items-end overflow-hidden rounded-xs ${
                  isToday ? 'bg-primary-soft' : 'bg-border/30'
                }`}
                title={`${bucket.label} · ${shortDuration(bucket.seconds)}`}
              >
                <div
                  className={`w-full rounded-xs transition-[height] duration-base ${
                    isToday ? 'bg-primary' : 'bg-primary/40'
                  }`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span
                className={`text-[9px] leading-none ${
                  isToday ? 'font-semibold text-primary' : 'text-muted/70'
                }`}
              >
                {isToday ? '今天' : weekdayOf(bucket.label)}
              </span>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
