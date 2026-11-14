'use client';

import { useMemo } from 'react';
import type { ActivityStats } from './types';
import { ScreenIcon } from './icons';

/**
 * 打卡热力图卡：GitHub 式最近 365 天热力格（53 周列 × 7 行，月份标签，固定尺寸格子，
 * 窄屏横向滚动且键盘可达）。数据来自事件订阅累积（todo.completed → dashboard.activity），
 * 前端只做展示；连续天数为宽容口径（单天空档每 14 天宽免 1 次，见 activity-streak.ts）。
 */

const WEEK_LABELS = ['一', '三', '五', '日'];
/** 行索引（0=周一）→ 侧边标签显示行 */
const WEEK_LABEL_ROWS = [0, 2, 4, 6];
const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];

function toDayString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface GridCell {
  day: string;
  count: number;
}

interface GridColumn {
  /** 本列周一的日期（月份标签用） */
  monday: string;
  cells: Array<GridCell | null>;
}

/** 生成以周一为行首的周列网格，覆盖最近 weeks 周（含本周），未来日期为 null */
function buildGrid(days: Map<string, number>, weeks: number): GridColumn[] {
  const today = new Date();
  // 本周一（getDay(): 周日=0 → 转为周一=0 的索引）
  const todayIndex = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(monday.getDate() - todayIndex);

  const columns: GridColumn[] = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const cells: Array<GridCell | null> = [];
    for (let r = 0; r < 7; r += 1) {
      const cell = new Date(monday);
      cell.setDate(monday.getDate() - w * 7 + r);
      const key = toDayString(cell);
      const isFuture = cell.getTime() > today.getTime();
      cells.push(isFuture ? null : { day: key, count: days.get(key) ?? 0 });
    }
    columns.push({ monday: toDayString(monday), cells });
  }
  return columns;
}

/** 月份标签行：与周列对齐，Monday 月份相对上一列变化时标注该月 */
function buildMonthLabels(columns: GridColumn[]): Array<string | null> {
  return columns.map((column, index) => {
    const month = Number(column.monday.slice(5, 7));
    if (index === 0) return MONTH_LABELS[month - 1] ?? null;
    const prevMonth = Number(columns[index - 1]!.monday.slice(5, 7));
    return month !== prevMonth ? (MONTH_LABELS[month - 1] ?? null) : null;
  });
}

function levelOf(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

const LEVEL_OPACITY = [0, 0.35, 0.6, 0.9] as const;

export function ActivityCard({ stats }: { stats: ActivityStats }) {
  const days = useMemo(() => new Map(stats.days.map((d) => [d.day, d.count])), [stats.days]);
  const columns = useMemo(() => buildGrid(days, 53), [days]);
  const monthLabels = useMemo(() => buildMonthLabels(columns), [columns]);
  const totalCount = stats.days.reduce((sum, d) => sum + d.count, 0);
  const activeDays = stats.days.length;

  const streakText =
    stats.streak > 0
      ? `连续 ${stats.streak} 天`
      : stats.todayCount > 0
        ? '今天已开始'
        : '从今天开始';

  return (
    <section
      className="screen-card screen-reveal p-5"
      aria-label="成长打卡"
      style={{ '--screen-index': 3 } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-sm border border-ok/20 bg-ok-soft text-ok">
            <ScreenIcon name="activity" className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">成长打卡</h2>
            <p className="screen-label mt-0.5 !text-[10px]">Momentum · Last 365 days</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted" aria-hidden>
          <span>少</span>
          {[0, 1, 2, 3].map((level) => (
            <span
              key={level}
              className="screen-cell size-2 rounded-[2px]"
              style={
                level === 0
                  ? undefined
                  : { background: 'var(--color-ok)', opacity: LEVEL_OPACITY[level] }
              }
              data-level={level}
            />
          ))}
          <span>多</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-sm border border-border bg-ok-soft p-3">
          <p className="font-mono text-3xl font-medium tracking-tight text-ok tabular-nums">
            {String(stats.streak).padStart(2, '0')}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {streakText}
            {stats.bestStreak > 0 ? ` · 最高 ${stats.bestStreak} 天` : ''}
          </p>
          {stats.graceUsed > 0 ? (
            <p className="mt-0.5 text-[10px] text-muted/80">
              本段已用 {stats.graceUsed} 次宽免（每 14 天 1 次休息不断签）
            </p>
          ) : null}
        </div>
        <div className="rounded-sm border border-border p-3">
          <p className="font-mono text-3xl font-medium tracking-tight tabular-nums">
            {String(stats.todayCount).padStart(2, '0')}
          </p>
          <p className="mt-1 text-[11px] text-muted">今日已完成</p>
        </div>
        <div className="rounded-sm border border-border p-3">
          <p className="font-mono text-3xl font-medium tracking-tight tabular-nums">{totalCount}</p>
          <p className="mt-1 text-[11px] text-muted">累计完成 · 活跃 {activeDays} 天</p>
        </div>
      </div>

      <div
        className="mt-4 overflow-x-auto rounded-sm pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        tabIndex={0}
        aria-label="最近一年打卡热力图，可左右滚动查看"
      >
        <div className="flex w-full min-w-max gap-[3px]">
          {/* 月份标签行：与周列对齐，按列宽对位（文字可溢出到相邻空列，GitHub 同款） */}
          <div className="mr-1 flex w-3 shrink-0 flex-col" aria-hidden />
          <div className="flex items-end gap-[3px]" aria-hidden>
            {monthLabels.map((label, index) => (
              <span key={index} className="w-3 whitespace-nowrap text-[10px] leading-4 text-muted">
                {label ?? ''}
              </span>
            ))}
          </div>
        </div>
        <div className="flex w-max min-w-max gap-[3px]" role="img" aria-label="最近一年打卡热力图">
          <div className="mr-1 flex w-3 shrink-0 flex-col gap-[3px] pt-[18px]" aria-hidden>
            {WEEK_LABELS.map((label, index) => (
              <span key={label} className="h-3 text-[10px] leading-3 text-muted">
                {WEEK_LABEL_ROWS.includes(index) ? label : ''}
              </span>
            ))}
          </div>
          {columns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex flex-col gap-[3px] pt-[18px]">
              {column.cells.map((cell, rowIndex) =>
                cell === null ? (
                  <span key={`${columnIndex}-${rowIndex}`} className="size-3" aria-hidden />
                ) : (
                  <span
                    key={`${columnIndex}-${rowIndex}`}
                    className="screen-cell size-3 rounded-[2px] transition-transform hover:scale-125"
                    title={
                      cell.count > 0
                        ? `${cell.day} · 完成 ${cell.count} 件`
                        : `${cell.day} · 未打卡`
                    }
                    style={
                      cell.count > 0
                        ? {
                            background: 'var(--color-ok)',
                            opacity: LEVEL_OPACITY[levelOf(cell.count)],
                          }
                        : undefined
                    }
                    data-level={levelOf(cell.count)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {stats.todayCount === 0 && stats.streak > 0 ? (
        <p className="mt-3 text-[11px] text-muted" role="status">
          完成任意一件待办，即可延续 {stats.streak} 天的记录。
        </p>
      ) : null}
      {stats.streak === 0 && stats.lastStreak > 0 ? (
        <p className="mt-3 text-[11px] text-muted" role="status">
          上次连续 {stats.lastStreak} 天 · 今天重新开始，小步回到节奏就好。
        </p>
      ) : null}
    </section>
  );
}
