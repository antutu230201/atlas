'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Skeleton, useToast } from '@atlas/ui';
import { api } from '@/lib/api';
import type { HabitsSnapshot } from '../index';

/**
 * 习惯打卡 · 今日视图：进度概览 + 打卡列表（连续天数/近 7 天格）+ 新建 + 归档恢复。
 * 数据走模块统一 call 通道（POST /modules/workspaces/:slug/habits/call/:action），
 * 动作直接返回新快照，前端以返回值替换查询缓存，省一次往返。
 * 视觉对齐大屏风格（screen-card / screen-label / 指标格）。
 */

const EMOJI_CHOICES = ['✅', '🔥', '💪', '📖', '🏃', '💧', '🧘', '🌅', '✍️', '🎸'];

function WeekDots({ week }: { week: { day: string; checked: boolean }[] }) {
  return (
    <div className="flex items-center gap-1" aria-label="近 7 天打卡记录">
      {week.map((item, index) => (
        <span
          key={item.day}
          title={item.day}
          className={`size-2.5 rounded-full border transition-colors ${
            item.checked
              ? 'border-ok bg-ok'
              : index === week.length - 1
                ? 'border-primary/50 bg-primary-soft'
                : 'border-border bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

/** 顶部进度概览：大数字 + 三个指标格（对齐大屏时钟卡的 HeroMetric 视觉） */
function ProgressBanner({ data, allDone }: { data: HabitsSnapshot; allDone: boolean }) {
  const bestStreak = Math.max(0, ...data.habits.map((item) => item.streak));
  return (
    <section
      aria-label="今日进度"
      className={`screen-card p-5 ${allDone ? '!border-ok/40' : ''}`}
      role="status"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="screen-label !text-[10px]">Habits · Daily check-in</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span
              className={`font-mono text-4xl font-semibold leading-none tabular-nums ${allDone ? 'text-ok' : 'text-primary'}`}
            >
              {data.doneToday}
            </span>
            <span className="font-mono text-lg text-muted">/ {data.totalToday}</span>
            <span className="text-xs text-muted">今日已打卡</span>
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {allDone
              ? `太棒了，${data.totalToday} 个习惯全部完成！保持节奏。`
              : `小步不停，剩余 ${data.totalToday - data.doneToday} 个。`}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-2 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          {[
            { value: data.habits.length, label: '习惯' },
            { value: data.habits.filter((item) => item.checkedToday).length, label: '已完成' },
            { value: bestStreak, label: '最佳连续' },
          ].map((metric) => (
            <div key={metric.label}>
              <span className="block font-mono text-2xl font-medium leading-none tabular-nums">
                {metric.value}
              </span>
              <span className="mt-1 block text-[10px] tracking-wider text-muted">
                {metric.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HabitsTodayPage({
  workspaceSlug,
  moduleName,
}: {
  workspaceSlug: string;
  moduleName: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(EMOJI_CHOICES[0]);
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;

  const snapshot = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'snapshot'],
    queryFn: () => api<HabitsSnapshot>(`${base}/snapshot`, { method: 'POST', json: {} }),
  });

  const apply = useMutation({
    mutationFn: ({ action, json }: { action: string; json?: Record<string, unknown> }) =>
      api<HabitsSnapshot>(`${base}/${action}`, { method: 'POST', json: json ?? {} }),
    onSuccess: (data) => {
      queryClient.setQueryData(['module', moduleName, workspaceSlug, 'snapshot'], data);
    },
    onError: (e: Error) => toast({ title: '操作失败', description: e.message, variant: 'err' }),
  });

  const create = useMutation({
    mutationFn: () =>
      api<HabitsSnapshot>(`${base}/createHabit`, { method: 'POST', json: { name, icon } }),
    onSuccess: (data) => {
      queryClient.setQueryData(['module', moduleName, workspaceSlug, 'snapshot'], data);
      setName('');
      setIcon(EMOJI_CHOICES[0]);
    },
    onError: (e: Error) => toast({ title: '创建失败', description: e.message, variant: 'err' }),
  });

  const data = snapshot.data;
  const busy = apply.isPending;
  const allDone = data !== undefined && data.totalToday > 0 && data.doneToday === data.totalToday;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">今日打卡</h1>
        <p className="screen-label mt-0.5 !text-[10px]">
          {data ? `Habits · ${data.today}` : 'Habits'}
        </p>
      </header>

      {snapshot.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-md" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : snapshot.isError ? (
        <div className="screen-card border-err/30 text-center text-sm text-err" role="alert">
          加载失败：{snapshot.error instanceof Error ? snapshot.error.message : '请重试'}
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={() => void snapshot.refetch()}>
              重试
            </Button>
          </div>
        </div>
      ) : (
        data && (
          <>
            <ProgressBanner data={data} allDone={allDone} />

            {data.habits.length > 0 ? (
              <ul className="space-y-2.5">
                {data.habits.map((item) => (
                  <li
                    key={item.id}
                    className={`screen-card flex items-center gap-3 p-3.5 transition-colors ${
                      item.checkedToday ? '!border-ok/40' : ''
                    }`}
                  >
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-sm border text-xl ${
                        item.checkedToday
                          ? 'border-ok/30 bg-ok-soft'
                          : 'border-primary/20 bg-primary-soft'
                      }`}
                      aria-hidden
                    >
                      {item.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium ${item.checkedToday ? 'text-ok' : 'text-text'}`}
                      >
                        {item.name}
                      </p>
                      <div className="mt-1 flex items-center gap-2.5">
                        <span className="text-[11px] text-muted" title={`已连续 ${item.streak} 天`}>
                          🔥 连续 {item.streak} 天
                        </span>
                        <WeekDots week={item.week} />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={item.checkedToday ? 'secondary' : 'primary'}
                      disabled={busy}
                      loading={busy}
                      aria-pressed={item.checkedToday}
                      onClick={() =>
                        apply.mutate({ action: 'toggleCheck', json: { habitId: item.id } })
                      }
                    >
                      {item.checkedToday ? '已打卡 ✓' : '打卡'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`归档习惯 ${item.name}`}
                      onClick={() =>
                        apply.mutate({ action: 'archiveHabit', json: { habitId: item.id } })
                      }
                    >
                      归档
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="screen-card border-dashed p-10 text-center">
                <p className="text-2xl" aria-hidden>
                  🔥
                </p>
                <p className="mt-2 text-sm font-medium">还没有习惯</p>
                <p className="mt-1 text-xs text-muted">
                  从一个小到不可能失败的动作开始，比如「读书 10 分钟」。
                </p>
              </div>
            )}

            {data.archived.length > 0 ? (
              <section aria-label="已归档" className="screen-card p-3">
                <p className="screen-label px-1 pb-2 !text-[10px]">已归档</p>
                <ul className="space-y-1.5">
                  {data.archived.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 px-1 text-xs text-muted">
                      <span aria-hidden>{item.icon}</span>
                      <span className="flex-1 truncate">{item.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          apply.mutate({ action: 'restoreHabit', json: { habitId: item.id } })
                        }
                      >
                        恢复
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <form
              className="screen-card border-dashed p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim().length > 0) create.mutate();
              }}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden /> 新建习惯
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="习惯名称，如：读书 10 分钟"
                  aria-label="习惯名称"
                  maxLength={40}
                  className="min-w-40 flex-1"
                />
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="选择图标">
                  {EMOJI_CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      role="radio"
                      aria-checked={icon === choice}
                      onClick={() => setIcon(choice)}
                      className={`size-8 rounded-sm border text-base transition-colors ${
                        icon === choice
                          ? 'border-primary bg-primary-soft'
                          : 'border-transparent hover:bg-surface-hover'
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={name.trim().length === 0}
                  loading={create.isPending}
                >
                  添加
                </Button>
              </div>
            </form>
          </>
        )
      )}
    </div>
  );
}
