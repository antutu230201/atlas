'use client';

import { useState } from 'react';
import { Button, Input, useToast } from '@atlas/ui';
import type { CountdownItem } from './types';

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
    <section aria-label="倒计时与纪念日" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-widest text-muted">倒计时 · 纪念日</h2>
        <span className="text-[10px] text-muted">{items.length} 个</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const days = daysFromToday(item.targetDate);
          const urgent = days !== null && days >= 0 && days <= 7;
          return (
            <div key={item.id} className="glass relative rounded-md p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</p>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={item.pinned ? '取消置顶' : '置顶'}
                    onClick={() => togglePin(item)}
                    className={`text-sm transition-colors hover:text-primary ${item.pinned ? 'text-warn' : 'text-muted'}`}
                  >
                    {item.pinned ? '★' : '☆'}
                  </button>
                ) : null}
              </div>
              <p className="mt-2 flex items-baseline gap-2">
                <span
                  className={`font-mono text-2xl font-semibold tabular-nums ${urgent ? 'text-err' : ''}`}
                >
                  {days === 0 ? '今天' : Math.abs(days ?? 0)}
                </span>
                <span className="text-xs text-muted">{daysText(days)}</span>
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted">{item.targetDate}</span>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`删除 ${item.title}`}
                    onClick={() => remove(item.id)}
                    className="text-xs text-muted transition-colors hover:text-err"
                  >
                    删除
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {canWrite ? (
          <div className="glass rounded-md p-4">
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
          </div>
        ) : null}
      </div>

      {items.length === 0 && !canWrite ? (
        <p className="text-xs text-muted">还没有倒计时。</p>
      ) : null}
    </section>
  );
}
