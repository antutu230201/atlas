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

const LUNAR_DAYS = Array.from({ length: 30 }, (_, index) => index + 1);
const LUNAR_DAY_NAMES = [
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
];

export interface CountdownUpdateInput {
  id: string;
  title?: string;
  targetDate?: string;
  pinned?: boolean;
  lunar?: boolean;
  lunarMonth?: number;
  lunarDay?: number;
  repeatYearly?: boolean;
}

export interface CountdownHandlers {
  canWrite: boolean;
  create: (input: Omit<CountdownUpdateInput, 'id'>) => void;
  update: (input: CountdownUpdateInput) => void;
  remove: (id: string) => void;
  togglePin: (item: CountdownItem) => void;
  creating: boolean;
  updating: boolean;
}

/** 倒计时区：卡片网格 + 内联新建表单（支持农历纪念日与每年循环） */
export function CountdownSection({
  items,
  handlers,
}: {
  items: CountdownItem[];
  handlers: CountdownHandlers;
}) {
  const { canWrite, create, update, remove, togglePin, creating, updating } = handlers;
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [lunarMode, setLunarMode] = useState(false);
  const [lunarMonth, setLunarMonth] = useState(1);
  const [lunarDay, setLunarDay] = useState(1);
  const [repeatYearly, setRepeatYearly] = useState(true);
  /** 行内编辑：editingId 非空时该卡片切换为编辑表单 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    date: string;
    lunar: boolean;
    lunarMonth: number;
    lunarDay: number;
    repeatYearly: boolean;
  } | null>(null);

  const startEdit = (item: CountdownItem) => {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      date: item.targetDate,
      lunar: item.lunar ?? false,
      lunarMonth: 1,
      lunarDay: 1,
      repeatYearly: item.repeatYearly ?? false,
    });
  };

  const saveEdit = () => {
    if (!editingId || !editDraft) return;
    if (editDraft.title.trim().length === 0) {
      toast({ title: '标题不能为空', variant: 'err' });
      return;
    }
    update({
      id: editingId,
      title: editDraft.title.trim(),
      lunar: editDraft.lunar,
      lunarMonth: editDraft.lunar ? editDraft.lunarMonth : undefined,
      lunarDay: editDraft.lunar ? editDraft.lunarDay : undefined,
      repeatYearly: editDraft.repeatYearly,
      // 公历模式必须带 targetDate（后端要求）；农历模式由后端重算
      targetDate: editDraft.lunar ? undefined : editDraft.date,
    });
    setEditingId(null);
    setEditDraft(null);
  };

  const submit = () => {
    if (title.trim().length === 0) {
      toast({ title: '请填写标题', variant: 'err' });
      return;
    }
    if (lunarMode) {
      create({
        title: title.trim(),
        lunar: true,
        lunarMonth,
        lunarDay,
        repeatYearly,
      });
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        toast({ title: '请填写日期', variant: 'err' });
        return;
      }
      create({ title: title.trim(), targetDate: date, repeatYearly });
    }
    setTitle('');
    setDate('');
    setLunarDay(1);
  };

  const formFields = (
    <>
      {lunarMode ? (
        <div className="flex gap-2">
          <select
            value={lunarMonth}
            onChange={(e) => setLunarMonth(Number(e.target.value))}
            aria-label="农历月"
            className="min-w-0 flex-1 rounded-xs border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-primary/50"
          >
            <optgroup label="平月">
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>
                  农历 {month} 月
                </option>
              ))}
            </optgroup>
            <optgroup label="闰月（不是每年都有）">
              {Array.from({ length: 12 }, (_, index) => -(index + 1)).map((month) => (
                <option key={month} value={month}>
                  闰 {-month} 月
                </option>
              ))}
            </optgroup>
          </select>
          <select
            value={lunarDay}
            onChange={(e) => setLunarDay(Number(e.target.value))}
            aria-label="农历日"
            className="min-w-0 flex-1 rounded-xs border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-primary/50"
          >
            {LUNAR_DAYS.map((day) => (
              <option key={day} value={day}>
                {LUNAR_DAY_NAMES[day - 1]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="目标日期"
          className="mb-2"
        />
      )}
      <label className="mb-2 flex items-center gap-3 text-[11px] text-muted">
        <span
          className="inline-flex cursor-pointer items-center gap-1"
          onClick={() => setLunarMode((value) => !value)}
        >
          <input
            type="checkbox"
            className="size-3 accent-[var(--primary)]"
            checked={lunarMode}
            onChange={(event) => setLunarMode(event.target.checked)}
          />
          农历
        </span>
        <span
          className="inline-flex cursor-pointer items-center gap-1"
          onClick={() => setRepeatYearly((value) => !value)}
        >
          <input
            type="checkbox"
            className="size-3 accent-[var(--primary)]"
            checked={repeatYearly}
            onChange={(event) => setRepeatYearly(event.target.checked)}
          />
          每年循环
        </span>
      </label>
      <Button size="sm" className="w-full" loading={creating} onClick={submit}>
        {lunarMode ? '添加农历纪念日' : '添加倒计时'}
      </Button>
    </>
  );

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
            <p className="screen-label mt-0.5 !text-[10px]">Moments worth waiting for</p>
          </div>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted">
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
          if (editingId === item.id && editDraft) {
            return (
              <article key={item.id} className="screen-card border-primary/40 p-4">
                <Input
                  value={editDraft.title}
                  onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                  aria-label="编辑标题"
                  className="mb-2"
                />
                {editDraft.lunar ? (
                  <div className="mb-2 flex gap-2">
                    <select
                      value={editDraft.lunarMonth}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, lunarMonth: Number(e.target.value) })
                      }
                      aria-label="编辑农历月"
                      className="min-w-0 flex-1 rounded-xs border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-primary/50"
                    >
                      <optgroup label="平月">
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                          <option key={month} value={month}>
                            农历 {month} 月
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="闰月（不是每年都有）">
                        {Array.from({ length: 12 }, (_, index) => -(index + 1)).map((month) => (
                          <option key={month} value={month}>
                            闰 {-month} 月
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <select
                      value={editDraft.lunarDay}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, lunarDay: Number(e.target.value) })
                      }
                      aria-label="编辑农历日"
                      className="min-w-0 flex-1 rounded-xs border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-primary/50"
                    >
                      {LUNAR_DAYS.map((day) => (
                        <option key={day} value={day}>
                          {LUNAR_DAY_NAMES[day - 1]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <Input
                    type="date"
                    value={editDraft.date}
                    onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                    aria-label="编辑目标日期"
                    className="mb-2"
                  />
                )}
                <label className="mb-2 flex items-center gap-3 text-[11px] text-muted">
                  <span className="inline-flex cursor-pointer items-center gap-1">
                    <input
                      type="checkbox"
                      className="size-3 accent-[var(--primary)]"
                      checked={editDraft.lunar}
                      onChange={(event) =>
                        setEditDraft({ ...editDraft, lunar: event.target.checked })
                      }
                    />
                    农历
                  </span>
                  <span className="inline-flex cursor-pointer items-center gap-1">
                    <input
                      type="checkbox"
                      className="size-3 accent-[var(--primary)]"
                      checked={editDraft.repeatYearly}
                      onChange={(event) =>
                        setEditDraft({ ...editDraft, repeatYearly: event.target.checked })
                      }
                    />
                    每年循环
                  </span>
                </label>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" loading={updating} onClick={saveEdit}>
                    保存
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft(null);
                    }}
                  >
                    取消
                  </Button>
                </div>
              </article>
            );
          }
          const days = daysFromToday(item.targetDate);
          const urgent = days !== null && days >= 0 && days <= 7;
          return (
            <article key={item.id} className="screen-card group p-4 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {item.title}
                  {item.repeatYearly ? (
                    <span
                      className="ml-1.5 align-middle text-[10px] text-muted/70"
                      title="每年循环，过期自动顺推"
                    >
                      ↻
                    </span>
                  ) : null}
                </p>
                {canWrite ? (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`编辑 ${item.title}`}
                      onClick={() => startEdit(item)}
                      className="rounded-xs p-1 text-muted transition-colors opacity-0 hover:bg-primary-soft hover:text-primary group-hover:opacity-100"
                    >
                      <ScreenIcon name="settings" className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={item.pinned ? '取消置顶' : '置顶'}
                      onClick={() => togglePin(item)}
                      className={`rounded-xs p-1 transition-colors hover:bg-primary-soft hover:text-primary ${item.pinned ? 'text-warn' : 'text-muted'}`}
                    >
                      <ScreenIcon name="pin" className="size-3.5" />
                    </button>
                  </div>
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
                <span className="font-mono text-[10px] text-muted">
                  {item.lunar && item.lunarLabel ? (
                    <span className="text-warn/90">{item.lunarLabel}</span>
                  ) : null}
                  <span className={item.lunar && item.lunarLabel ? 'ml-1.5' : ''}>
                    {item.targetDate}
                  </span>
                </span>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`删除 ${item.title}`}
                    onClick={() => remove(item.id)}
                    className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-err"
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
            <div className="mb-3 flex items-center gap-2 text-[11px] text-muted">
              <ScreenIcon name="plus" className="size-3.5" />
              标记下一个重要时刻
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="事项名称，如：妈妈生日"
              aria-label="倒计时名称"
              className="mb-2"
            />
            {formFields}
          </div>
        ) : null}
      </div>

      {items.length === 0 && !canWrite ? (
        <p className="text-xs text-muted">还没有倒计时。</p>
      ) : null}
    </section>
  );
}
