'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@atlas/ui';
import { api } from '@/lib/api';
import { ListeningStage } from './listening-stage';
import { ScreenIcon } from './icons';

/**
 * 听歌统计页（大屏延伸子页 /m/dashboard/listening）。
 *
 * 信息层级（2026-11 改版）：
 * 1. 页头：标题 + 统计窗口切换 —— 不再把切换器压在 3D 场景上；
 * 2. 主区：3D 舞台（黑胶 + 声浪柱）占 8 列，KPI 独立成栏占 4 列。
 *    旧版把三张数据卡绝对定位盖在舞台上，最高的一根柱子被卡片遮住、
 *    舞台右半空白，因此改为栅格分栏，各自占位互不重叠；
 * 3. 分析区：播放趋势（带日期轴与数值）+ 最常播放（等高卡片，不随行数塌陷）；
 * 4. 全站排名：只取 Top 10，两列排布；我不在前十时单独钉一行"我的位置"，
 *    避免旧版把 50 条全渲染成一条无底长卷。
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

interface RankingEntry {
  userId: string;
  userName: string;
  seconds: number;
  rank: number;
}

interface RankingPayload {
  range: Range;
  list: RankingEntry[];
  me: RankingEntry | null;
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

/** 分桶单位：day/week/month 都是按天分桶，year 按月 */
const RANGE_BUCKET_NOUN: Record<Range, string> = {
  day: '天',
  week: '天',
  month: '天',
  year: '月',
};

const RANKING_LIMIT = 10;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分`;
}

/** KPI 卡里数字与单位分开排：数字用等宽大号，单位用弱化小字。 */
function splitDuration(seconds: number): { value: string; unit: string } {
  if (seconds <= 0) return { value: '0', unit: '分钟' };
  if (seconds < 60) return { value: String(seconds), unit: '秒' };
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return { value: String(totalMinutes), unit: '分钟' };
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { value: String(hours), unit: minutes === 0 ? '小时' : `小时 ${minutes} 分` };
}

/** 分桶标签：YYYY-MM-DD → 11/6；YYYY-MM → 11 月 */
function bucketLabel(label: string): string {
  if (/^\d{4}-\d{2}$/.test(label)) return `${Number(label.slice(5))} 月`;
  const parts = label.split('-');
  if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`;
  return label;
}

function bucketFullLabel(label: string): string {
  if (/^\d{4}-\d{2}$/.test(label)) return `${label.slice(0, 4)} 年 ${Number(label.slice(5))} 月`;
  const parts = label.split('-');
  if (parts.length === 3) return `${Number(parts[1])} 月 ${Number(parts[2])} 日`;
  return label;
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
  const loading = summaryQuery.isPending;
  const topSong = summary?.topSongs[0];
  const totalSeconds = summary?.totalSeconds ?? 0;
  const totalPlays = summary?.totalPlays ?? 0;
  const activeBuckets = summary?.buckets.filter((bucket) => bucket.seconds > 0).length ?? 0;
  const duration = splitDuration(totalSeconds);

  return (
    <div
      className="dashboard-screen relative min-h-screen overflow-hidden bg-bg text-text"
      data-testid="listening-stats"
    >
      {/* 大屏同款氛围背景：天空渐变 + 网格 + 柔化遮罩 */}
      <div className="screen-sky" aria-hidden />
      <div className="screen-grid absolute inset-0" aria-hidden />
      <div className="absolute inset-0" style={{ background: 'var(--screen-scrim)' }} aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1320px] space-y-4 p-4 pb-28 md:p-6 md:pb-28">
        {/* ---------- 页头 ---------- */}
        <header className="screen-reveal flex flex-wrap items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-sm border border-primary/25 bg-primary-soft text-primary">
                <ScreenIcon name="music" className="size-4" />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight">听歌统计</h1>
                <p className="mt-0.5 text-[11px] text-muted">
                  {RANGE_HINTS[range]} · 播放器实时心跳累计
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex shrink-0 rounded-full border border-border bg-surface/70 p-1 shadow-soft backdrop-blur-md"
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
                  'min-w-11 rounded-full px-3.5 py-1.5 text-sm transition-colors',
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
        </header>

        {summaryQuery.isError || rankingQuery.isError ? (
          <div className="screen-card p-6 text-center text-sm text-warn">
            统计数据加载失败，请稍后重试。
          </div>
        ) : null}

        {/* ---------- 主区：3D 舞台 + KPI 栏 ---------- */}
        <section className="grid gap-4 xl:grid-cols-12" aria-label="听歌概览">
          <div className="screen-card screen-reveal relative min-h-[300px] sm:min-h-[360px] xl:col-span-8">
            <ListeningStage
              className="absolute inset-0"
              buckets={summary?.buckets ?? []}
              totalSeconds={totalSeconds}
              topTitle={topSong?.title}
              topArtist={topSong?.artist}
              empty={!loading && totalSeconds === 0}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 xl:col-span-4 xl:gap-4">
            {/* 总时长：主指标，占满一行 */}
            <KpiTile
              className="col-span-2"
              label="总时长"
              icon="activity"
              accent
              value={loading ? '—' : duration.value}
              unit={loading ? '' : duration.unit}
              hint={
                loading
                  ? '正在统计'
                  : totalSeconds === 0
                    ? '这个窗口还没有播放记录'
                    : `平均每${RANGE_BUCKET_NOUN[range]} ${
                        activeBuckets > 0
                          ? formatDuration(Math.round(totalSeconds / activeBuckets))
                          : '0'
                      }`
              }
            />
            <KpiTile
              label="播放次数"
              icon="play"
              value={loading ? '—' : String(totalPlays)}
              unit="次"
              hint={
                totalPlays > 0
                  ? `平均每首 ${formatDuration(Math.round(totalSeconds / Math.max(1, totalPlays)))}`
                  : '暂无播放'
              }
            />
            <KpiTile
              label={`活跃${RANGE_BUCKET_NOUN[range]}`}
              icon="calendar"
              value={loading ? '—' : String(activeBuckets)}
              unit={RANGE_BUCKET_NOUN[range]}
              hint={
                summary && summary.buckets.length > 0
                  ? `覆盖率 ${Math.round((activeBuckets / summary.buckets.length) * 100)}%`
                  : '—'
              }
            />
            <KpiTile
              className="col-span-2"
              label="全站排名"
              icon="layers"
              value={ranking?.me ? `第 ${ranking.me.rank}` : '—'}
              unit={ranking?.me ? '名' : ''}
              hint={
                ranking?.me
                  ? `共 ${ranking.list.length} 人参与 · 我的时长 ${formatDuration(ranking.me.seconds)}`
                  : loading
                    ? '正在统计'
                    : '还没有排名记录'
              }
              highlight={Boolean(ranking?.me && ranking.me.rank <= 3)}
            />
          </div>
        </section>

        {/* ---------- 趋势 + 最常播放 ---------- */}
        <section className="grid gap-4 xl:grid-cols-12" aria-label="听歌趋势与最常播放">
          <TrendCard
            className="screen-card screen-reveal xl:col-span-7"
            buckets={summary?.buckets ?? []}
            loading={loading}
            range={range}
          />
          <TopSongsCard
            className="screen-card screen-reveal xl:col-span-5"
            songs={summary?.topSongs ?? []}
            loading={loading}
            totalSeconds={totalSeconds}
          />
        </section>

        {/* ---------- 全站排名 ---------- */}
        <RankingCard
          className="screen-card screen-reveal"
          ranking={ranking}
          loading={rankingQuery.isPending}
          range={range}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI 卡                                                              */
/* ------------------------------------------------------------------ */

function KpiTile({
  label,
  value,
  unit,
  hint,
  icon,
  accent = false,
  highlight = false,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon: 'activity' | 'play' | 'calendar' | 'layers';
  accent?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-between rounded-sm border p-3.5 transition-colors',
        accent
          ? 'border-primary/30 bg-primary-soft'
          : highlight
            ? 'border-primary/25 bg-surface'
            : 'border-border bg-surface/60',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-muted">{label}</span>
        <ScreenIcon
          name={icon}
          className={cn(
            'size-3.5 shrink-0',
            accent || highlight ? 'text-primary' : 'text-muted/70',
          )}
        />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-[26px] font-semibold leading-none tracking-tight tabular-nums">
          {value}
        </span>
        {unit ? <span className="text-xs font-medium text-muted">{unit}</span> : null}
      </div>
      {hint ? <p className="mt-2 truncate text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 播放趋势                                                            */
/* ------------------------------------------------------------------ */

function TrendCard({
  buckets,
  loading,
  range,
  className,
}: {
  buckets: Array<{ label: string; seconds: number }>;
  loading: boolean;
  range: Range;
  className?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.seconds));
  const hasData = buckets.some((bucket) => bucket.seconds > 0);
  const active = hovered !== null ? buckets[hovered] : null;
  const peak = buckets.reduce(
    (best, bucket) => (bucket.seconds > best.seconds ? bucket : best),
    buckets[0] ?? { label: '', seconds: 0 },
  );
  // 柱子多时抽稀横轴标签，避免 30 天挤成一团
  const labelStep = buckets.length > 20 ? 5 : buckets.length > 12 ? 2 : 1;
  // 单日窗口没有"趋势"可言：与其画一根恒定满格柱，不如给一条横向占比条
  const single = buckets.length === 1;

  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ScreenIcon name="activity" className="size-3.5 text-primary" />
          {single ? '今日时长' : '播放趋势'}
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          {single
            ? '切到「周 / 月 / 年」看分布'
            : `每${RANGE_BUCKET_NOUN[range]}听歌时长 · ${RANGE_HINTS[range]}`}
        </p>
      </div>
      {single ? null : (
        <div className="text-right">
          <p className="font-mono text-sm font-semibold tabular-nums">
            {active
              ? formatDuration(active.seconds)
              : peak.seconds > 0
                ? formatDuration(peak.seconds)
                : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {active
              ? bucketFullLabel(active.label)
              : peak.seconds > 0
                ? `峰值 · ${bucketFullLabel(peak.label)}`
                : '暂无数据'}
          </p>
        </div>
      )}
    </div>
  );

  if (single) {
    return (
      <section className={cn('flex flex-col p-4 sm:p-5', className)} aria-label="今日听歌时长">
        {heading}
        <div className="mt-5 flex flex-1 flex-col justify-center">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[34px] font-semibold leading-none tracking-tight tabular-nums">
              {loading ? '—' : splitDuration(buckets[0]?.seconds ?? 0).value}
            </span>
            <span className="text-sm text-muted">
              {loading ? '' : splitDuration(buckets[0]?.seconds ?? 0).unit}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-border/50">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-slow ease-out-soft"
              style={{ width: loading ? '0%' : hasData ? '100%' : '0%' }}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted">
            {loading
              ? '正在统计'
              : hasData
                ? `今天已经开始听歌了，${bucketFullLabel(buckets[0]?.label ?? '')}的记录已计入`
                : '今天还没有播放记录，去大屏放一首吧'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={cn('flex flex-col p-4 sm:p-5', className)} aria-label="播放趋势">
      {heading}

      <div className="relative mt-5 flex-1">
        {/* 值域参考线 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[168px] flex-col justify-between">
          {[0, 1, 2].map((line) => (
            <div key={line} className="border-t border-dashed border-border/50" />
          ))}
        </div>

        {loading ? (
          <div className="relative flex h-[168px] items-end gap-1.5">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className="flex-1 animate-pulse rounded-t-xs bg-border/50"
                style={{ height: `${25 + ((index * 17) % 55)}%` }}
              />
            ))}
          </div>
        ) : !hasData ? (
          <div className="relative flex h-[168px] flex-col items-center justify-center gap-1.5 text-center">
            <ScreenIcon name="music" className="size-5 text-muted/50" />
            <p className="text-xs text-muted">这个窗口里还没有播放记录</p>
            <p className="text-[11px] text-muted/70">去大屏放一首歌，数据会实时出现在这里</p>
          </div>
        ) : (
          <div
            className="relative flex h-[168px] items-end gap-[3px] sm:gap-1.5"
            role="img"
            aria-label={`${RANGE_HINTS[range]}播放时长趋势，峰值 ${formatDuration(peak.seconds)}`}
            onMouseLeave={() => setHovered(null)}
          >
            {buckets.map((bucket, index) => {
              const ratio = bucket.seconds / max;
              const height = bucket.seconds > 0 ? Math.max(6, ratio * 100) : 0;
              const isToday = index === buckets.length - 1 && range !== 'year';
              const isActive = hovered === index;
              return (
                <button
                  key={bucket.label}
                  type="button"
                  className="group relative flex h-full min-w-0 flex-1 cursor-default items-end"
                  onMouseEnter={() => setHovered(index)}
                  onFocus={() => setHovered(index)}
                  aria-label={`${bucketFullLabel(bucket.label)} ${formatDuration(bucket.seconds)}`}
                >
                  <span
                    className={cn(
                      'w-full rounded-t-xs transition-all duration-fast',
                      bucket.seconds === 0
                        ? 'bg-border/40'
                        : isActive
                          ? 'bg-primary'
                          : isToday
                            ? 'bg-primary/85'
                            : 'bg-primary/45 group-hover:bg-primary/70',
                    )}
                    style={{ height: bucket.seconds === 0 ? 3 : `${height}%` }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && hasData ? (
        <div className="mt-2 flex h-4 gap-[3px] sm:gap-1.5" aria-hidden>
          {buckets.map((bucket, index) => (
            <span
              key={bucket.label}
              className={cn(
                'flex-1 truncate text-center font-mono text-[10px] tabular-nums',
                index === buckets.length - 1 ? 'text-text' : 'text-muted/70',
                index % labelStep === 0 || index === buckets.length - 1 ? '' : 'opacity-0',
              )}
            >
              {bucketLabel(bucket.label)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 最常播放                                                            */
/* ------------------------------------------------------------------ */

function TopSongsCard({
  songs,
  loading,
  totalSeconds,
  className,
}: {
  songs: SummaryPayload['topSongs'];
  loading: boolean;
  totalSeconds: number;
  className?: string;
}) {
  const max = Math.max(1, ...songs.map((song) => song.seconds));

  return (
    <section className={cn('flex flex-col p-4 sm:p-5', className)} aria-label="最常播放">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ScreenIcon name="playlist" className="size-3.5 text-primary" />
            最常播放
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            {songs.length > 0 ? `共 ${songs.length} 首 · 按累计时长排序` : '按累计时长排序'}
          </p>
        </div>
        <span className="font-mono text-[10px] tracking-wider text-muted/70">TOP TRACKS</span>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-sm bg-border/40" />
          ))}
        </div>
      ) : songs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-10 text-center">
          <ScreenIcon name="playlist" className="size-5 text-muted/50" />
          <p className="text-xs text-muted">还没有听歌记录</p>
        </div>
      ) : (
        <ol className="mt-3 space-y-1">
          {songs.slice(0, 6).map((song, index) => (
            <li
              key={song.songId}
              className={cn(
                'group relative isolate flex items-center gap-3 overflow-hidden rounded-sm px-2 py-2 transition-colors hover:bg-surface-hover',
                index === 0 && 'bg-primary-soft/60',
              )}
            >
              {/* 行内比例条：底色即占比，一眼看出谁占大头 */}
              <span
                className="absolute inset-y-0 left-0 -z-10 rounded-sm bg-primary/10"
                style={{ width: `${Math.max(6, (song.seconds / max) * 100)}%` }}
                aria-hidden
              />
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold tabular-nums',
                  index === 0
                    ? 'bg-primary text-on-primary'
                    : index < 3
                      ? 'bg-primary/15 text-primary'
                      : 'bg-surface-hover text-muted',
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-5">
                  {song.title}
                </span>
                <span className="block truncate text-[11px] leading-4 text-muted">
                  {song.artist} · {song.plays} 次播放
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[13px] font-semibold tabular-nums">
                  {formatDuration(song.seconds)}
                </span>
                <span className="block font-mono text-[10px] tabular-nums text-muted/80">
                  {totalSeconds > 0 ? Math.round((song.seconds / totalSeconds) * 100) : 0}%
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 全站排名                                                            */
/* ------------------------------------------------------------------ */

function RankingCard({
  ranking,
  loading,
  range,
  className,
}: {
  ranking: RankingPayload | undefined;
  loading: boolean;
  range: Range;
  className?: string;
}) {
  const list = ranking?.list ?? [];
  const top = list.slice(0, RANKING_LIMIT);
  const max = Math.max(1, ...list.map((item) => item.seconds));
  const me = ranking?.me ?? null;
  // 我不在榜内前列时，单独钉一行，避免"我在哪"要靠数行数
  const meOutside = me && !top.some((item) => item.userId === me.userId) ? me : null;
  const columns: RankingEntry[][] = [];
  for (let i = 0; i < top.length; i += 5) columns.push(top.slice(i, i + 5));

  return (
    <section className={cn('p-4 sm:p-5', className)} aria-label="全站排名">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ScreenIcon name="layers" className="size-3.5 text-primary" />
            全站排名
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            {RANGE_HINTS[range]} · {list.length >= 50 ? '50+' : list.length} 人参与
          </p>
        </div>
        <span className="font-mono text-[10px] tracking-wider text-muted/70">
          {me ? `我 · 第 ${me.rank} 名` : 'GLOBAL RANKING'}
        </span>
      </div>

      {loading ? (
        <div className="mt-3 grid gap-x-6 gap-y-1.5 lg:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded-sm bg-border/40" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
          <ScreenIcon name="layers" className="size-5 text-muted/50" />
          <p className="text-xs text-muted">还没有人听过歌</p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-x-6 lg:grid-cols-2">
            {columns.map((column, columnIndex) => (
              <ol key={columnIndex} className="space-y-1">
                {column.map((item) => (
                  <RankingRow
                    key={item.userId}
                    item={item}
                    max={max}
                    isMe={me?.userId === item.userId}
                  />
                ))}
              </ol>
            ))}
          </div>

          {meOutside ? (
            <div className="mt-3 border-t border-dashed border-border pt-3">
              <p className="mb-1.5 text-[10px] font-semibold tracking-widest text-muted">
                我的位置
              </p>
              <ol>
                <RankingRow item={meOutside} max={max} isMe />
              </ol>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function RankingRow({ item, max, isMe }: { item: RankingEntry; max: number; isMe: boolean }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-hover',
        isMe && 'bg-primary-soft/70',
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold tabular-nums',
          item.rank === 1
            ? 'bg-primary text-on-primary'
            : item.rank <= 3
              ? 'bg-primary/15 text-primary'
              : 'bg-surface-hover text-muted',
        )}
      >
        {item.rank}
      </span>
      <span className="w-16 shrink-0 truncate text-[13px] sm:w-20">
        {item.userName}
        {isMe ? <span className="ml-1 text-[10px] font-semibold text-primary">我</span> : null}
      </span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border/50">
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-slow',
            isMe ? 'bg-primary' : 'bg-primary/45',
          )}
          style={{ width: `${Math.max(2, (item.seconds / max) * 100)}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">
        {formatDuration(item.seconds)}
      </span>
    </li>
  );
}
