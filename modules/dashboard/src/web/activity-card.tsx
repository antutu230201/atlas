'use client';

import { useMemo } from 'react';
import type { ActivityStats } from './types';

/**
 * 打卡热力图卡：左 连续天数/今日产出，右 GitHub 式半年热力格。
 * 数据来自事件订阅累积（todo.completed → dashboard.activity），前端只做展示。
 * 依据习惯追踪 UX 惯例采用"宽容型"文案：今天还没打卡不断签，避免内疚式流失。
 */

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function toDayString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 生成以周一为行首的周列网格，覆盖最近 weeks 周（含本周） */
function buildGrid(
  days: Map<string, number>,
  weeks: number,
): Array<Array<{ day: string; count: number } | null>> {
  const today = new Date();
  // 本周一（getDay(): 周日=0 → 转为周一=0 的索引）
  const todayIndex = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(monday.getDate() - todayIndex);

  const columns: Array<Array<{ day: string; count: number } | null>> = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const column: Array<{ day: string; count: number } | null> = [];
    for (let r = 0; r < 7; r += 1) {
      const cell = new Date(monday);
      cell.setDate(monday.getDate() - w * 7 + r);
      const key = toDayString(cell);
      const isFuture = cell.getTime() > today.getTime();
      column.push(isFuture ? null : { day: key, count: days.get(key) ?? 0 });
    }
    columns.push(column);
  }
  return columns;
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
  const columns = useMemo(() => buildGrid(days, 26), [days]);
  const totalCount = stats.days.reduce((sum, d) => sum + d.count, 0);

  const streakText =
    stats.streak > 0
      ? `连续 ${stats.streak} 天`
      : stats.todayCount > 0
        ? '今天已开始'
        : '从今天开始';

  return (
    <div className="glass rounded-md p-5" aria-label="成长打卡">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted">成长打卡</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span aria-hidden className="text-2xl">
              🔥
            </span>
            <span className="text-3xl font-semibold tabular-nums">{stats.streak}</span>
            <span className="text-sm text-muted">天连续</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {streakText} · 今日已完成 {stats.todayCount} 件 · 半年累计 {totalCount} 件
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted" aria-hidden>
          <span>少</span>
          {[0, 1, 2, 3].map((level) => (
            <span
              key={level}
              className="size-2.5 rounded-xs"
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

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1" role="img" aria-label="最近半年完成待办热力图">
          <div className="mr-1 flex flex-col gap-1 pt-0.5" aria-hidden>
            {WEEK_LABELS.map((label, index) => (
              <span key={label} className="h-3 text-[9px] leading-3 text-muted">
                {index % 2 === 0 ? label : ''}
              </span>
            ))}
          </div>
          {columns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex flex-col gap-1">
              {column.map((cell, rowIndex) =>
                cell === null ? (
                  <span key={`${columnIndex}-${rowIndex}`} className="size-3" aria-hidden />
                ) : (
                  <span
                    key={`${columnIndex}-${rowIndex}`}
                    className="size-3 rounded-xs"
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
        <p className="mt-3 text-xs text-muted" role="status">
          今天还没有完成待办——别担心，完成任意一件即可延续 {stats.streak} 天的记录。
        </p>
      ) : null}
    </div>
  );
}
