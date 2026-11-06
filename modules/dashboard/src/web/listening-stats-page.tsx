'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@atlas/ui';
import { api } from '@/lib/api';
import { ScreenIcon } from './icons';

/**
 * 听歌统计页（大屏延伸子页 /m/dashboard/listening）：
 * 日/周/月/年四个窗口的总时长、逐桶柱状图、Top 歌曲与工作空间成员排名。
 * 数据来自 listeningSummary / listeningRanking（心跳按天×用户×歌曲聚合）。
 */

type Range = 'day' | 'week' | 'month' | 'year';

interface SummaryPayload {
  range: Range;
  totalSeconds: number;
  totalPlays: number;
  buckets: Array<{ label: string; seconds: number }>;
  topSongs: Array<{
    songId: number;
    title: string;
    artist: string;
    seconds: number;
    plays: number;
  }>;
}

interface RankingPayload {
  range: Range;
  list: Array<{ userId: string; userName: string; seconds: number; rank: number }>;
  me: { userId: string; userName: string; seconds: number; rank: number } | null;
}

const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
];

const RANGE_HINTS: Record<Range, string> = {
  day: '今天',
  week: '最近 7 天',
  month: '最近 30 天',
  year: '最近 12 个月',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}

function shortBucketLabel(label: string, range: Range): string {
  if (range === 'year') return label.slice(5); // 2026-11 → 11
  return label.slice(5); // 2026-11-07 → 11-07
}

export function ListeningStatsPage({ workspaceSlug }: { workspaceSlug: string }) {
  const base = `/modules/workspaces/${workspaceSlug}/dashboard/call`;
  const [range, setRange] = useState<Range>('week');

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'listening-summary', range],
    queryFn: () =>
      api<SummaryPayload>(`${base}/listeningSummary`, { method: 'POST', json: { range } }),
    staleTime: 30_000,
  });
  const rankingQuery = useQuery({
    queryKey: ['dashboard', 'listening-ranking', range],
    queryFn: () =>
      api<RankingPayload>(`${base}/listeningRanking`, { method: 'POST', json: { range } }),
    staleTime: 30_000,
  });

  const summary = summaryQuery.data;
  const ranking = rankingQuery.data;
  const maxBucketSeconds = Math.max(
    1,
    ...(summary?.buckets.map((bucket) => bucket.seconds) ?? [1]),
  );
  const maxRankSeconds = Math.max(1, ...(ranking?.list.map((item) => item.seconds) ?? [1]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8" data-testid="listening-stats">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ScreenIcon name="music" className="size-5 text-primary" />
            听歌统计
          </h1>
          <p className="mt-1 text-sm text-muted">
            来自悬浮播放器的真实播放时长 · {RANGE_HINTS[range]}
          </p>
        </div>
        <div
          className="flex rounded-sm border border-border p-0.5"
          role="tablist"
          aria-label="统计窗口"
        >
          {RANGES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={range === item.value}
              className={cn(
                'rounded-xs px-3 py-1.5 text-sm transition-colors',
                range === item.value
                  ? 'bg-primary-soft font-semibold text-primary'
                  : 'text-muted hover:text-text',
              )}
              onClick={() => setRange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {summaryQuery.isPending || rankingQuery.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-24 animate-pulse rounded-md bg-surface-hover" />
          <div className="h-48 animate-pulse rounded-md bg-surface-hover" />
        </div>
      ) : summaryQuery.isError || rankingQuery.isError ? (
        <div className="rounded-md border border-border bg-surface p-6 text-center text-sm text-warn">
          统计数据加载失败，请稍后重试。
        </div>
      ) : (
        <>
          {/* 总览 */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-surface p-4">
              <p className="text-[11px] font-semibold tracking-widest text-muted">总时长</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatDuration(summary!.totalSeconds)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface p-4">
              <p className="text-[11px] font-semibold tracking-widest text-muted">播放次数</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{summary!.totalPlays}</p>
            </div>
            <div className="rounded-md border border-border bg-surface p-4">
              <p className="text-[11px] font-semibold tracking-widest text-muted">我的排名</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {ranking!.me ? `第 ${ranking!.me.rank} 名` : '暂无记录'}
              </p>
            </div>
          </div>

          {/* 逐桶柱状图（纯 CSS，与大屏既有组件风格一致） */}
          <section className="rounded-md border border-border bg-surface p-4" aria-label="听歌趋势">
            <h2 className="text-sm font-semibold">趋势</h2>
            <div
              className="mt-4 flex h-36 items-end gap-1"
              role="img"
              aria-label="每个时间桶的听歌时长柱状图"
            >
              {summary!.buckets.map((bucket) => (
                <div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-28 w-full items-end justify-center">
                    <div
                      className={cn(
                        'w-full max-w-6 rounded-xs transition-all',
                        bucket.seconds > 0 ? 'bg-primary/70' : 'bg-border/60',
                      )}
                      style={{
                        height: `${Math.max(bucket.seconds > 0 ? 6 : 2, (bucket.seconds / maxBucketSeconds) * 100)}%`,
                      }}
                      title={`${bucket.label} · ${formatDuration(bucket.seconds)}`}
                    />
                  </div>
                  <span className="w-full truncate text-center font-mono text-[10px] text-muted">
                    {shortBucketLabel(bucket.label, range)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top 歌曲 */}
            <section
              className="rounded-md border border-border bg-surface p-4"
              aria-label="最常播放"
            >
              <h2 className="text-sm font-semibold">最常播放</h2>
              {summary!.topSongs.length === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  这个窗口里还没有播放记录，去大屏放几首歌吧。
                </p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {summary!.topSongs.map((song, index) => (
                    <li key={song.songId} className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-center font-mono text-[11px] text-muted">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{song.title}</span>
                        <span className="block truncate text-[11px] text-muted">{song.artist}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {formatDuration(song.seconds)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* 成员排名 */}
            <section
              className="rounded-md border border-border bg-surface p-4"
              aria-label="工作空间排名"
            >
              <h2 className="text-sm font-semibold">全站排名</h2>
              {ranking!.list.length === 0 ? (
                <p className="mt-4 text-sm text-muted">还没有人听过歌，去大屏放一首吧。</p>
              ) : (
                <ol className="mt-3 space-y-2.5">
                  {ranking!.list.map((item) => (
                    <li key={item.userId} className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                          item.rank === 1
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-hover text-muted',
                        )}
                      >
                        {item.rank}
                      </span>
                      <span className="w-20 shrink-0 truncate text-sm">
                        {item.userName}
                        {ranking!.me?.userId === item.userId ? (
                          <span className="ml-1 text-[10px] text-primary">（我）</span>
                        ) : null}
                      </span>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-border/60">
                        <span
                          className="block h-full rounded-full bg-primary/70"
                          style={{ width: `${(item.seconds / maxRankSeconds) * 100}%` }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
                        {formatDuration(item.seconds)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
