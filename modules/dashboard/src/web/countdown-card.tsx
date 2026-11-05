'use client';

import { useState } from 'react';
import { Button, Input, useToast } from '@atlas/ui';
import type { CountdownItem } from './types';
import { ScreenIcon } from './icons';

function daysFromToday(targetDate: string): number | null {
  const target = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - todayStart.getTime()) / 86_400_000);
}

function daysText(days: number | null): string {
  if (days === null) return '日期无效';
  if (days === 0) return '就是今天';
  return days > 0 ? `还有 ${days} 天` : `已过 ${-days} 天`;
}

export interface CountdownHandlers {
  canWrite: boolean;
  create: (input: { title: string; targetDate: string; pinned?: boolean }) => void;
  remove: (id: string) => void;
  togglePin: (item: CountdownItem) => void;
  creating: boolean;
}

/** 倒计时区：卡片网格 + 内联新建表单（member+ 可写，guest 只读） */
export function CountdownSection({
  items,
  handlers,
}: {
  items: CountdownItem[];
  handlers: CountdownHandlers;
}) {
  const { canWrite, create, remove, togglePin, creating } = handlers;
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  const submit = () => {
    if (title.trim().length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast({ title: '请填写标题和日期', variant: 'err' });
      return;
    }
    create({ title: title.trim(), targetDate: date });
    setTitle('');
    setDate('');
  };

  return (
    <section
      aria-label="倒计时与纪念日"
      className="screen-reveal space-y-3"
      style={{ '--screen-index': 10 } as React.CSSProperties}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <ScreenIcon name="calendar" className="size-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">倒计时与纪念日</h2>
            <p className="screen-label mt-0.5 !text-[8px]">Moments worth waiting for</p>
          </div>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] text-muted">
          {String(items.length).padStart(2, '0')}
        </span>
      </div>

      <div
        className={
          items.length === 0
            ? 'grid gap-3 sm:grid-cols-2'
            : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
        }
      >
        {items.map((item) => {
          const days = daysFromToday(item.targetDate);
          const urgent = days !== null && days >= 0 && days <= 7;
          return (
            <article key={item.id} className="screen-card group p-4 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</p>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={item.pinned ? '取消置顶' : '置顶'}
                    onClick={() => togglePin(item)}
                    className={`rounded-xs p-1 transition-colors hover:bg-primary-soft hover:text-primary ${item.pinned ? 'text-warn' : 'text-muted'}`}
                  >
                    <ScreenIcon name="pin" className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="mt-3 flex items-baseline gap-2">
                <span
                  className={`font-mono text-3xl font-medium tracking-tight tabular-nums ${urgent ? 'text-err' : 'text-primary'}`}
                >
                  {days === 0 ? '今天' : Math.abs(days ?? 0)}
                </span>
                <span className="text-[11px] text-muted">{daysText(days)}</span>
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="font-mono text-[9px] text-muted">{item.targetDate}</span>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`删除 ${item.title}`}
                    onClick={() => remove(item.id)}
                    className="flex items-center gap-1 text-[10px] text-muted transition-colors hover:text-err"
                  >
                    <ScreenIcon name="trash" className="size-3" /> 删除
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}

        {canWrite ? (
          <div
            className={`screen-card border-dashed p-4 ${items.length === 0 ? 'sm:col-span-2' : ''}`}
          >
            {items.length === 0 ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="mb-1 flex shrink-0 items-center gap-2 pr-2 text-[11px] text-muted sm:mb-0">
                  <ScreenIcon name="plus" className="size-3.5" /> 标记下一个重要时刻
                </div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="事项名称，如：生日"
                  aria-label="倒计时名称"
                  className="min-w-0 flex-1"
                />
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="目标日期"
                  className="sm:w-44"
                />
                <Button size="sm" className="sm:w-32" loading={creating} onClick={submit}>
                  添加倒计时
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2 text-[11px] text-muted">
                  <ScreenIcon name="plus" className="size-3.5" /> 标记下一个重要时刻
                </div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="事项名称，如：生日"
                  aria-label="倒计时名称"
                  className="mb-2"
                />
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="目标日期"
                  className="mb-2"
                />
                <Button size="sm" className="w-full" loading={creating} onClick={submit}>
                  添加倒计时
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {items.length === 0 && !canWrite ? (
        <p className="text-xs text-muted">还没有倒计时。</p>
      ) : null}
    </section>
  );
}
