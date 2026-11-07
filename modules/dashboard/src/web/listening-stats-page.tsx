'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@atlas/ui';
import { api } from '@/lib/api';
import { ListeningStage } from './listening-stage';
import { ScreenIcon } from './icons';

/**
 * 听歌统计页（大屏延伸子页 /m/dashboard/listening）：
 * 顶部 three.js 3D 舞台（黑胶 + 声浪柱 + 音符粒子，随日/周/月/年切换），
 * 下方玻璃拟态榜单（Top 歌曲 / 全站排名）。数据来自 listeningSummary / listeningRanking。
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
  const topSong = summary?.topSongs[0];
  const maxRankSeconds = Math.max(1, ...(ranking?.list.map((item) => item.seconds) ?? [1]));

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-bg text-text"
      data-testid="listening-stats"
    >
      {/* 大屏同款氛围背景：天空渐变 + 网格 + 柔化遮罩 */}
      <div className="screen-sky" aria-hidden />
      <div className="screen-grid absolute inset-0" aria-hidden />
      <div className="absolute inset-0" style={{ background: 'var(--screen-scrim)' }} aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-5xl space-y-5 p-4 pb-24 md:p-8 md:pb-24">
        {/* 3D 舞台：黑胶 + 声浪柱 + 音符粒子 */}
        <section className="screen-card relative h-[400px]" aria-label="听歌数据 3D 舞台">
          <ListeningStage
            className="absolute inset-0"
            buckets={summary?.buckets ?? []}
            totalSeconds={summary?.totalSeconds ?? 0}
            topTitle={topSong?.title}
            topArtist={topSong?.artist}
          />

          {/* 范围切换（悬浮） */}
          <div
            className="absolute left-4 top-4 z-20 flex rounded-full border border-border bg-surface/70 p-1 shadow-soft backdrop-blur-md"
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
                  'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                  range === item.value
                    ? 'bg-primary font-semibold text-on-primary shadow-soft'
                    : 'text-muted hover:text-text',
                )}
                onClick={() => setRange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* 标题 + 数据卡（悬浮右侧） */}
          <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
            <div className="pointer-events-auto text-right">
              <h1 className="text-lg font-semibold tracking-tight">听歌统计</h1>
              <p className="text-[11px] text-muted">{RANGE_HINTS[range]}</p>
            </div>
            <div className="pointer-events-auto w-44 rounded-md border border-border bg-surface/70 p-3 shadow-soft backdrop-blur-md">
              <p className="text-[10px] font-semibold tracking-widest text-muted">总时长</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {summary ? formatDuration(summary.totalSeconds) : '—'}
              </p>
            </div>
            <div className="pointer-events-auto w-44 rounded-md border border-border bg-surface/70 p-3 shadow-soft backdrop-blur-md">
              <p className="text-[10px] font-semibold tracking-widest text-muted">播放次数</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {summary?.totalPlays ?? '—'}
              </p>
            </div>
            <div className="pointer-events-auto w-44 rounded-md border border-primary/40 bg-primary-soft/80 p-3 shadow-soft backdrop-blur-md">
              <p className="text-[10px] font-semibold tracking-widest text-muted">我的排名</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {ranking?.me ? `第 ${ranking.me.rank} 名` : '暂无记录'}
              </p>
            </div>
          </div>
        </section>

        {summaryQuery.isError || rankingQuery.isError ? (
          <div className="screen-card p-6 text-center text-sm text-warn">
            统计数据加载失败，请稍后重试。
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 最常播放 */}
          <section className="screen-card p-4" aria-label="最常播放">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ScreenIcon name="music" className="size-3.5 text-primary" />
              最常播放
              <span className="screen-label ml-auto !text-[10px]">Top tracks</span>
            </h2>
            {summary && summary.topSongs.length > 0 ? (
              <ol className="mt-3 space-y-1.5">
                {summary.topSongs.map((song, index) => (
                  <li
                    key={song.songId}
                    className={cn(
                      'group flex items-center gap-3 rounded-sm border border-transparent px-2.5 py-2 transition-all duration-fast hover:translate-x-1 hover:border-border hover:bg-surface-hover',
                      index === 0 && 'border-primary/30 bg-primary-soft/60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        index === 0
                          ? 'bg-gradient-to-br from-primary to-primary/60 text-on-primary'
                          : 'bg-surface-hover text-muted',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{song.title}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {song.artist} · {song.plays} 次
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {formatDuration(song.seconds)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted">
                这个窗口里还没有播放记录，去大屏放几首歌吧。
              </p>
            )}
          </section>

          {/* 全站排名 */}
          <section className="screen-card p-4" aria-label="全站排名">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ScreenIcon name="activity" className="size-3.5 text-primary" />
              全站排名
              <span className="screen-label ml-auto !text-[10px]">Global ranking</span>
            </h2>
            {ranking && ranking.list.length > 0 ? (
              <ol className="mt-3 space-y-2.5">
                {ranking.list.map((item) => (
                  <li key={item.userId} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        item.rank === 1
                          ? 'bg-gradient-to-br from-primary to-primary/60 text-on-primary shadow-soft'
                          : 'bg-surface-hover text-muted',
                      )}
                    >
                      {item.rank}
                    </span>
                    <span className="w-24 shrink-0 truncate text-sm">
                      {item.userName}
                      {ranking.me?.userId === item.userId ? (
                        <span className="ml-1 text-[10px] font-semibold text-primary">（我）</span>
                      ) : null}
                    </span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-border/60">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-primary to-primary/50 transition-[width] duration-base"
                        style={{ width: `${(item.seconds / maxRankSeconds) * 100}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
                      {formatDuration(item.seconds)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted">还没有人听过歌，去大屏放一首吧。</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
