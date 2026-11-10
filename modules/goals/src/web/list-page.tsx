'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@atlas/ui';
import { api } from '@/lib/api';
import type { GoalsSnapshot, KeyResultView, ObjectiveView } from '../index';

/**
 * 目标与年度计划 · 列表页：概览指标 → 目标卡（关键结果行内更新进度）→ 归档区 → 新建表单。
 * 数据走模块统一 call 通道，动作直接返回新快照，前端以返回值替换查询缓存，省一次往返。
 * 视觉对齐大屏风格（screen-card / screen-label / 指标格）。
 */

const ICON_CHOICES = ['🎯', '📈', '💪', '📚', '🏃', '💰', '🎨', '🧘', '🌱', '🏆'];

/** 由周期起止日推导展示标签（如 2026 · 年度 / 2026 Q4 / 2026-11） */
function periodLabel(objective: ObjectiveView): string {
  if (objective.period === 'custom')
    return `自定义 · ${objective.startDate} ~ ${objective.endDate}`;
  const year = objective.startDate.slice(0, 4);
  if (objective.period === 'year') return `${year} 年度`;
  if (objective.period === 'quarter') {
    const month = Number(objective.startDate.slice(5, 7));
    return `${year} Q${Math.ceil(month / 3)}`;
  }
  if (objective.period === 'month') return objective.startDate.slice(0, 7);
  return objective.startDate;
}

/** 数值展示：整数不带小数，非整数保留一位 */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 数值型步进步长：区间 / 10，下限 0.1 */
function stepSize(kr: KeyResultView): number {
  return Math.max(Math.abs(kr.targetValue - kr.startValue) / 10, 0.1);
}

/* ---------------- 局部组件 ---------------- */

function ProgressBar({ value, achieved }: { value: number; achieved?: boolean }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${achieved ? 'bg-ok' : 'bg-primary'}`}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

/** 顶部概览：大数字 + 三个指标格（对齐 habits ProgressBanner 视觉） */
function SummaryBanner({ data }: { data: GoalsSnapshot }) {
  const s = data.summary;
  return (
    <section aria-label="目标概览" className="screen-card p-5" role="status">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="screen-label !text-[10px]">Goals · Direction and progress</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-semibold leading-none tabular-nums text-primary">
              {Math.round(s.avgProgress * 100)}
              <span className="text-lg">%</span>
            </span>
            <span className="text-xs text-muted">进行中目标平均进度</span>
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {s.activeCount > 0
              ? s.achievedCount > 0
                ? `${s.achievedCount} 个目标已全部达成，继续保持。`
                : '把大目标拆成可度量的小步，一步一格。'
              : '从一个想清楚的方向开始。'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-2 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          {[
            { value: s.activeCount, label: '进行中目标' },
            { value: `${s.keyResultDone}/${s.keyResultTotal}`, label: '已达成关键结果' },
            { value: s.achievedCount, label: '全部达成' },
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

/** 关键结果行：boolean 型切换达成；number 型 ± 步进或直接输入当前值 */
function KeyResultRow({
  kr,
  busy,
  onProgress,
  onDelete,
}: {
  kr: KeyResultView;
  busy: boolean;
  onProgress: (input: { currentValue?: number; done?: boolean }) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(fmt(kr.currentValue));

  const commitNumber = (raw: string) => {
    const value = Number(raw);
    if (Number.isFinite(value) && value !== kr.currentValue) onProgress({ currentValue: value });
  };

  const nudge = (direction: 1 | -1) => {
    const base = Number(draft);
    const next = (Number.isFinite(base) ? base : kr.currentValue) + direction * stepSize(kr);
    const rounded = Math.round(next * 100) / 100;
    setDraft(fmt(rounded));
    if (rounded !== kr.currentValue) onProgress({ currentValue: rounded });
  };

  return (
    <li className="group flex flex-wrap items-center gap-2 rounded-sm px-1.5 py-1.5 hover:bg-surface-hover">
      {kr.type === 'boolean' ? (
        <Button
          size="sm"
          variant={kr.done ? 'secondary' : 'primary'}
          disabled={busy}
          aria-pressed={kr.done}
          onClick={() => onProgress({ done: !kr.done })}
        >
          {kr.done ? '已达成 ✓' : '标记达成'}
        </Button>
      ) : (
        <span className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            disabled={busy}
            aria-label={`减少 ${kr.title} 当前进度`}
            onClick={() => nudge(-1)}
          >
            −
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            disabled={busy}
            aria-label={`增加 ${kr.title} 当前进度`}
            onClick={() => nudge(1)}
          >
            ＋
          </Button>
        </span>
      )}
      <div className="min-w-0 flex-1 basis-40">
        <p
          className={`truncate text-sm ${kr.done ? 'text-ok line-through decoration-ok/50' : 'text-text'}`}
        >
          {kr.title}
        </p>
        {kr.type === 'number' ? (
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-[11px] tabular-nums text-muted">
              {fmt(kr.currentValue)}
              {kr.unit ? ` ${kr.unit}` : ''} / {fmt(kr.targetValue)}
              {kr.unit ? ` ${kr.unit}` : ''}
            </span>
            <div className="w-16">
              <ProgressBar value={kr.progress} achieved={kr.progress >= 1} />
            </div>
          </div>
        ) : null}
      </div>
      {kr.type === 'number' ? (
        <label className="sr-only" htmlFor={`kr-current-${kr.id}`}>
          {kr.title} 当前进度
        </label>
      ) : null}
      {kr.type === 'number' ? (
        <input
          id={`kr-current-${kr.id}`}
          type="number"
          inputMode="decimal"
          step="any"
          className="h-8 w-20 rounded-sm border border-border bg-bg px-2 text-right font-mono text-xs tabular-nums outline-none focus:border-primary"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commitNumber(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        disabled={busy}
        aria-label={`删除关键结果 ${kr.title}`}
        onClick={onDelete}
      >
        删除
      </Button>
    </li>
  );
}

/** 新增关键结果行内表单（展开/收起） */
function AddKeyResultForm({
  objectiveId,
  busy,
  onCreate,
}: {
  objectiveId: string;
  busy: boolean;
  onCreate: (input: {
    objectiveId: string;
    title: string;
    type: 'number' | 'boolean';
    startValue?: number;
    targetValue?: number;
    unit?: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'number' | 'boolean'>('number');
  const [start, setStart] = useState('0');
  const [target, setTarget] = useState('10');
  const [unit, setUnit] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        className="mt-1 w-full rounded-sm border border-dashed border-border py-1.5 text-xs text-muted transition-colors hover:border-primary/50 hover:text-primary"
        onClick={() => setOpen(true)}
      >
        ＋ 添加关键结果
      </button>
    );
  }

  const submit = () => {
    if (title.trim().length === 0) return;
    onCreate({
      objectiveId,
      title: title.trim(),
      type,
      ...(type === 'number'
        ? {
            startValue: Number(start) || 0,
            targetValue: Number(target) || 1,
            unit: unit.trim() || undefined,
          }
        : {}),
    });
    setTitle('');
    setStart('0');
    setTarget('10');
    setUnit('');
    setOpen(false);
  };

  return (
    <div className="mt-1 space-y-2 rounded-sm border border-dashed border-border p-2.5">
      <Input
        aria-label="关键结果标题"
        placeholder="可度量的结果，如「体重降到 70kg」"
        value={title}
        maxLength={120}
        disabled={busy}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={(value) => setType(value as 'number' | 'boolean')}>
          <SelectTrigger aria-label="关键结果类型" className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">数值型</SelectItem>
            <SelectItem value="boolean">达成型</SelectItem>
          </SelectContent>
        </Select>
        {type === 'number' ? (
          <>
            <label className="flex items-center gap-1 text-[11px] text-muted">
              起点
              <Input
                aria-label="起点数值"
                type="number"
                inputMode="decimal"
                step="any"
                className="h-8 w-20 text-xs"
                value={start}
                disabled={busy}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted">
              目标
              <Input
                aria-label="目标数值"
                type="number"
                inputMode="decimal"
                step="any"
                className="h-8 w-20 text-xs"
                value={target}
                disabled={busy}
                onChange={(event) => setTarget(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted">
              单位
              <Input
                aria-label="数值单位"
                placeholder="kg"
                className="h-8 w-16 text-xs"
                value={unit}
                maxLength={10}
                disabled={busy}
                onChange={(event) => setUnit(event.target.value)}
              />
            </label>
          </>
        ) : (
          <span className="text-[11px] text-muted">完成 / 未完成两态</span>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          取消
        </Button>
        <Button size="sm" disabled={busy || title.trim().length === 0} onClick={submit}>
          添加
        </Button>
      </div>
    </div>
  );
}

/** 目标卡：头部（图标/标题/周期/进度）+ 关键结果列表 + 行内新增 */
function ObjectiveCard({
  objective,
  busy,
  onAction,
}: {
  objective: ObjectiveView;
  busy: boolean;
  onAction: (action: string, json?: Record<string, unknown>) => void;
}) {
  return (
    <article
      className={`screen-card p-4 ${objective.achieved ? '!border-ok/40' : ''}`}
      aria-label={`目标 ${objective.title}`}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary-soft text-xl"
          aria-hidden
        >
          {objective.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{objective.title}</h2>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted">
              {periodLabel(objective)}
            </span>
            {objective.achieved ? (
              <span className="rounded-full border border-ok/40 bg-ok-soft px-2 py-0.5 text-[10px] text-ok">
                已达成 ✓
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted">
            {objective.startDate} ~ {objective.endDate}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={`font-mono text-xl font-semibold tabular-nums ${objective.achieved ? 'text-ok' : 'text-primary'}`}
          >
            {Math.round(objective.progress * 100)}%
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 sm:opacity-100"
            disabled={busy}
            aria-label={`归档目标 ${objective.title}`}
            onClick={() => onAction('archiveObjective', { objectiveId: objective.id })}
          >
            归档
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar value={objective.progress} achieved={objective.achieved} />
      </div>

      {objective.description ? (
        <p className="mt-2.5 text-xs leading-relaxed text-muted">{objective.description}</p>
      ) : null}

      {objective.keyResults.length > 0 ? (
        <ul className="mt-2.5 divide-y divide-border/60">
          {objective.keyResults.map((kr) => (
            <KeyResultRow
              key={kr.id}
              kr={kr}
              busy={busy}
              onProgress={(input) =>
                onAction('updateKeyResultProgress', { keyResultId: kr.id, ...input })
              }
              onDelete={() => onAction('deleteKeyResult', { keyResultId: kr.id })}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-sm border border-dashed border-border px-2.5 py-2 text-xs text-muted">
          还没有关键结果——把它拆成 1–3 条可度量的「从 X 到 Y」。
        </p>
      )}

      <AddKeyResultForm
        objectiveId={objective.id}
        busy={busy}
        onCreate={(input) =>
          onAction('createKeyResult', input as unknown as Record<string, unknown>)
        }
      />
    </article>
  );
}

/* ---------------- 页面 ---------------- */

export function GoalsListPage({
  workspaceSlug,
  moduleName,
}: {
  workspaceSlug: string;
  moduleName: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState(ICON_CHOICES[0] ?? '🎯');
  const [period, setPeriod] = useState<'year' | 'quarter' | 'month' | 'custom'>('year');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const base = `/modules/workspaces/${workspaceSlug}/${moduleName}/call`;
  const queryKey = ['module', moduleName, workspaceSlug, 'snapshot'];

  const snapshot = useQuery({
    queryKey,
    queryFn: () => api<GoalsSnapshot>(`${base}/snapshot`, { method: 'POST', json: {} }),
  });

  const apply = useMutation({
    mutationFn: ({ action, json }: { action: string; json?: Record<string, unknown> }) =>
      api<GoalsSnapshot>(`${base}/${action}`, { method: 'POST', json: json ?? {} }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
    onError: (e: Error) => toast({ title: '操作失败', description: e.message, variant: 'err' }),
  });

  const create = useMutation({
    mutationFn: () =>
      api<GoalsSnapshot>(`${base}/createObjective`, {
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim() || undefined,
          period,
          icon,
          ...(period === 'custom' ? { startDate, endDate } : {}),
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      setTitle('');
      setDescription('');
      setIcon(ICON_CHOICES[0] ?? '🎯');
      setPeriod('year');
      setStartDate('');
      setEndDate('');
      toast({ title: '目标已创建' });
    },
    onError: (e: Error) => toast({ title: '创建失败', description: e.message, variant: 'err' }),
  });

  const data = snapshot.data;
  const busy = apply.isPending || create.isPending;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">目标</h1>
        <p className="screen-label mt-0.5 !text-[10px]">Goals · Direction and progress</p>
      </header>

      {snapshot.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-md" />
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-md" />
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
            <SummaryBanner data={data} />

            {data.objectives.length > 0 ? (
              <div className="space-y-3">
                {data.objectives.map((objective) => (
                  <ObjectiveCard
                    key={objective.id}
                    objective={objective}
                    busy={busy}
                    onAction={(action, json) => apply.mutate({ action, json })}
                  />
                ))}
              </div>
            ) : (
              <div className="screen-card border-dashed p-10 text-center">
                <p className="text-2xl" aria-hidden>
                  🎯
                </p>
                <p className="mt-2 text-sm font-medium">还没有目标</p>
                <p className="mt-1 text-xs text-muted">
                  定一个让自己心跳加速的方向，再拆成可以度量的小步。
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
                      <span className="flex-1 truncate">{item.title}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          apply.mutate({
                            action: 'restoreObjective',
                            json: { objectiveId: item.id },
                          })
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
                if (title.trim().length > 0) create.mutate();
              }}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden /> 新建目标
              </p>
              <div className="mt-3 space-y-2.5">
                <Input
                  aria-label="目标标题"
                  placeholder="这个周期，最重要的一件事是什么？"
                  value={title}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="目标图标"
                >
                  {ICON_CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      aria-label={`图标 ${choice}`}
                      aria-pressed={icon === choice}
                      disabled={busy}
                      className={`size-8 rounded-sm border text-base transition-colors ${
                        icon === choice
                          ? 'border-primary/50 bg-primary-soft'
                          : 'border-border hover:border-primary/30'
                      }`}
                      onClick={() => setIcon(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={period}
                    onValueChange={(value) =>
                      setPeriod(value as 'year' | 'quarter' | 'month' | 'custom')
                    }
                  >
                    <SelectTrigger aria-label="目标周期" className="h-9 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="year">年度</SelectItem>
                      <SelectItem value="quarter">季度</SelectItem>
                      <SelectItem value="month">月度</SelectItem>
                      <SelectItem value="custom">自定义</SelectItem>
                    </SelectContent>
                  </Select>
                  {period === 'custom' ? (
                    <>
                      <label className="flex items-center gap-1 text-[11px] text-muted">
                        开始
                        <Input
                          aria-label="开始日期"
                          type="date"
                          className="h-9 w-36 text-xs"
                          value={startDate}
                          required
                          disabled={busy}
                          onChange={(event) => setStartDate(event.target.value)}
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-muted">
                        结束
                        <Input
                          aria-label="结束日期"
                          type="date"
                          className="h-9 w-36 text-xs"
                          value={endDate}
                          required
                          disabled={busy}
                          onChange={(event) => setEndDate(event.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted">
                      周期边界将按今天自动计算（
                      {period === 'year'
                        ? '1/1 – 12/31'
                        : period === 'quarter'
                          ? '本季度首末'
                          : '本月首末'}
                      ）
                    </span>
                  )}
                </div>
                <Input
                  aria-label="目标说明（可选）"
                  placeholder="为什么是这个目标？（可选）"
                  value={description}
                  maxLength={500}
                  disabled={busy}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy || title.trim().length === 0} loading={busy}>
                    创建目标
                  </Button>
                </div>
              </div>
            </form>
          </>
        )
      )}
    </div>
  );
}
