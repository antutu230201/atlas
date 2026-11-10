'use client';

import Link from 'next/link';
import { Skeleton } from '@atlas/ui';
import { ScreenIcon } from './icons';

/**
 * 今日焦点卡：跨模块聚合视图（模块间不直读表，经各自模块的公开接口取数）。
 * 左「今日要务」= 待办模块高优先级未完成 top3；右「目标推进」= 目标模块未达成目标 top2。
 * 模块未启用 / 无数据 / 请求失败均静默降级为引导空态，不打扰大屏主信息流。
 */

export interface FocusTodoItem {
  id: string;
  title: string;
  priority: 'low' | 'normal' | 'high';
  dueDate: string | null;
}

export interface FocusGoalItem {
  id: string;
  title: string;
  icon: string;
  /** 0–1 */
  progress: number;
}

function localDay(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 截止日归一化为本地 YYYY-MM-DD。
 * 待办的 dueDate 是 timestamp 列，接口经 JSON 返回 ISO 字符串（如 2026-11-10T16:00:00.000Z），
 * 直接做字符串相等会永远失败。
 */
export function dueDay(due: string): string {
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 截止日口语化：今天 / 明天 / 已过期 / M/D */
function dueLabel(due: string): { text: string; tone: 'today' | 'overdue' | 'plain' } {
  const day = dueDay(due);
  const today = localDay();
  if (day === today) return { text: '今天', tone: 'today' };
  if (day < today) return { text: '已过期', tone: 'overdue' };
  if (day === localDay(1)) return { text: '明天', tone: 'plain' };
  return { text: day.slice(5).replace('-', '/'), tone: 'plain' };
}

const DUE_TONE_CLASS: Record<'today' | 'overdue' | 'plain', string> = {
  today: 'text-primary',
  overdue: 'text-err',
  plain: 'text-muted',
};

export function FocusCard({
  todos,
  goals,
  loading = false,
}: {
  todos: FocusTodoItem[];
  goals: FocusGoalItem[];
  loading?: boolean;
}) {
  const empty = todos.length === 0 && goals.length === 0;

  return (
    <section
      className="screen-card screen-reveal p-4 sm:p-5"
      aria-label="今日焦点"
      style={{ '--screen-index': 2 } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-sm border border-primary/20 bg-primary-soft text-primary">
            <ScreenIcon name="focus" className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">今日焦点</h2>
            <p className="screen-label mt-0.5 !text-[10px]">Focus · What matters today</p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-muted">
          {todos.length > 0 ? <span className="text-primary">{todos.length} 要务</span> : null}
          {goals.length > 0 ? <span>{goals.length} 目标在推进</span> : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      ) : empty ? (
        <p className="mt-4 rounded-sm border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
          今天还没有重点——
          <Link href="/m/goals/list" className="text-primary underline-offset-2 hover:underline">
            定一个目标
          </Link>
          ，或
          <Link
            href="/m/todo_notes/list"
            className="text-primary underline-offset-2 hover:underline"
          >
            添加一条高优待办
          </Link>
          。
        </p>
      ) : (
        <div className="mt-4 grid gap-x-6 gap-y-4 xl:grid-cols-2">
          {todos.length > 0 ? (
            <div>
              <p className="screen-label px-1 pb-1.5 !text-[10px]">今日要务</p>
              <ul className="space-y-1">
                {todos.map((item) => {
                  const due = item.dueDate ? dueLabel(item.dueDate) : null;
                  return (
                    <li key={item.id}>
                      <Link
                        href="/m/todo_notes/list"
                        className="flex items-center gap-2.5 rounded-sm px-1 py-1.5 transition-colors hover:bg-surface-hover"
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-err"
                          aria-hidden
                          title="高优先级"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                        {due ? (
                          <span
                            className={`shrink-0 font-mono text-[11px] tabular-nums ${DUE_TONE_CLASS[due.tone]}`}
                          >
                            {due.text}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {goals.length > 0 ? (
            <div>
              <p className="screen-label px-1 pb-1.5 !text-[10px]">目标推进</p>
              <ul className="space-y-2">
                {goals.map((goal) => (
                  <li key={goal.id}>
                    <Link
                      href="/m/goals/list"
                      className="flex items-center gap-2.5 rounded-sm px-1 py-1 transition-colors hover:bg-surface-hover"
                    >
                      <span aria-hidden className="shrink-0 text-base">
                        {goal.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{goal.title}</span>
                        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-border">
                          <span
                            className="block h-full rounded-full bg-primary transition-[width] duration-300"
                            style={{ width: `${Math.round(goal.progress * 100)}%` }}
                          />
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-primary">
                        {Math.round(goal.progress * 100)}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
