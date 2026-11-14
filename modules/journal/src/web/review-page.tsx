'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Reveal,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@atlas/ui';
import { api } from '@/lib/api';
import { buildJournalReportHtml, downloadJournalReport } from './review-report';
import type { EntryView, JournalSnapshot, YearStats } from '../index';

/**
 * 复盘 · 日记/周复盘双页签：心情五档 + 模板提示写作 + 周复盘本地草稿（前端聚合
 * 待办/习惯/目标的公开接口，零 AI）+ 月列表/归档恢复。
 * AI 仅在「润色」按钮显式触发（服务端一次调用入库存档；Mock 未配置时明确拒绝）。
 */

const MOODS = [
  { value: 1, emoji: '😞', label: '很难' },
  { value: 2, emoji: '😕', label: '不佳' },
  { value: 3, emoji: '😐', label: '一般' },
  { value: 4, emoji: '🙂', label: '不错' },
  { value: 5, emoji: '😄', label: '很好' },
];

const moodEmoji = (mood: number | null): string =>
  MOODS.find((item) => item.value === mood)?.emoji ?? '·';

const KIND_LABEL: Record<string, string> = { daily: '日记', weekly: '周复盘' };

function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return localDay(d);
}

function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** 周一 → 该周日期范围文案（M/D – M/D） */
function weekRange(monday: string): string {
  const fmt = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  return `${fmt(monday)} – ${fmt(addDays(monday, 6))}`;
}

/** 年视图柱状图：12 个月平均心情柱（无记录月为灰点），数据来自 yearSnapshot 聚合 */
function YearMoodChart({ stats }: { stats: YearStats }) {
  const W = 320;
  const H = 96;
  const PAD_X = 14;
  const TOP = 10;
  const BOTTOM = 72;
  const barW = 12;
  const yOf = (mood: number) => BOTTOM - ((mood - 1) / 4) * (BOTTOM - TOP);
  const hasData = stats.total.days > 0 || stats.total.avgMood !== null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 h-28 w-full"
      role="img"
      aria-label={`${stats.year} 年心情柱状图，${stats.total.days} 天记录${
        stats.total.avgMood !== null ? `，平均 ${stats.total.avgMood}` : ''
      }`}
      preserveAspectRatio="xMidYMid meet"
    >
      {[1, 3, 5].map((level) => (
        <line
          key={level}
          x1={PAD_X}
          x2={W - PAD_X}
          y1={yOf(level)}
          y2={yOf(level)}
          className="stroke-border"
          strokeDasharray="2 4"
          strokeWidth="1"
          opacity="0.5"
        />
      ))}
      {stats.months.map((month, index) => {
        const x = PAD_X + index * ((W - PAD_X * 2) / 12) + ((W - PAD_X * 2) / 12 - barW) / 2;
        const label = `${month.month} · ${month.days} 天${month.avgMood !== null ? ` · 平均 ${month.avgMood}` : ''}`;
        if (month.avgMood === null) {
          return (
            <g key={month.month}>
              <circle cx={x + barW / 2} cy={BOTTOM} r="2" className="fill-border">
                <title>{label}</title>
              </circle>
              <text
                x={x + barW / 2}
                y={H - 2}
                textAnchor="middle"
                fontSize="7"
                className="fill-muted"
              >
                {index + 1}
              </text>
            </g>
          );
        }
        const barTop = yOf(month.avgMood);
        return (
          <g key={month.month}>
            <rect
              x={x}
              y={barTop}
              width={barW}
              height={Math.max(BOTTOM - barTop, 2)}
              rx="2"
              fill="var(--color-primary)"
              opacity="0.85"
            >
              <title>{label}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={H - 2}
              textAnchor="middle"
              fontSize="7"
              className="fill-muted"
            >
              {index + 1}
            </text>
          </g>
        );
      })}
      {!hasData ? (
        <text x={W / 2} y={TOP + 24} textAnchor="middle" fontSize="9" className="fill-muted">
          {stats.year} 年还没有复盘记录
        </text>
      ) : null}
    </svg>
  );
}

/**
 * 心情趋势卡（零 AI，纯 SVG）：本月带心情的复盘按日连线，展示平均心情。
 * x 轴为日期（1–月末），y 轴为心情 1–5；数据来自 snapshot.entries，前端只做展示。
 */
function MoodTrendCard({ entries, month }: { entries: EntryView[]; month: string }) {
  const moods = entries
    .filter((item) => item.mood !== null)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((item) => ({ day: item.day, mood: item.mood as number }));
  if (moods.length === 0) return null;

  const [year, monthIndex] = month.split('-').map(Number);
  const daysInMonth = new Date(year!, monthIndex!, 0).getDate();
  const W = 320;
  const H = 88;
  const PAD_X = 14;
  const TOP = 10;
  const BOTTOM = 74;
  const xOf = (day: string) =>
    PAD_X + ((Number(day.slice(8, 10)) - 1) / (daysInMonth - 1)) * (W - PAD_X * 2);
  const yOf = (mood: number) => BOTTOM - ((mood - 1) / 4) * (BOTTOM - TOP);
  const avg = moods.reduce((sum, item) => sum + item.mood, 0) / moods.length;

  return (
    <section
      className="screen-card p-4"
      aria-label={`心情趋势，${moods.length} 条记录，平均 ${avg.toFixed(1)} 分（满分 5）`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="screen-label !text-[10px]">Mood trend · 心情走势</p>
        <p className="font-mono text-xs tabular-nums text-muted">
          平均 <span className="text-base font-semibold text-primary">{avg.toFixed(1)}</span> / 5 ·{' '}
          {moods.length} 条
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-24 w-full"
        role="img"
        aria-hidden={false}
        preserveAspectRatio="xMidYMid meet"
      >
        {[1, 2, 3, 4, 5].map((level) => (
          <line
            key={level}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={yOf(level)}
            y2={yOf(level)}
            className="stroke-border"
            strokeDasharray="2 4"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}
        <polyline
          points={moods.map((item) => `${xOf(item.day)},${yOf(item.mood)}`).join(' ')}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.85"
        />
        {moods.map((item) => (
          <g key={item.day}>
            <circle cx={xOf(item.day)} cy={yOf(item.mood)} r="3.5" fill="var(--color-primary)">
              <title>{`${item.day} · ${moodEmoji(item.mood)} ${item.mood}/5`}</title>
            </circle>
          </g>
        ))}
        {/* 首末日期标注 */}
        <text x={PAD_X} y={H - 2} className="fill-muted" fontSize="8">
          {moods[0]!.day.slice(8, 10)} 日
        </text>
        <text x={W - PAD_X - 12} y={H - 2} className="fill-muted" fontSize="8">
          {moods[moods.length - 1]!.day.slice(8, 10)} 日
        </text>
        <text x={4} y={yOf(5) + 3} className="fill-muted" fontSize="8">
          😄
        </text>
        <text x={4} y={yOf(1) + 3} className="fill-muted" fontSize="8">
          😞
        </text>
      </svg>
    </section>
  );
}

/** 本周周一（本地时区） */
function currentMonday(): string {
  const now = new Date();
  return localDay(new Date(now.getTime() - ((now.getDay() + 6) % 7) * 86_400_000));
}

interface DraftPiece {
  ok: boolean;
  text: string;
}

/** 周复盘本地草稿：聚合待办/习惯/目标的公开接口（模块间不直读表），失败静默降级 */
function useWeeklyDraft() {
  return async (monday: string, workspaceSlug: string): Promise<string> => {
    const weekEnd = addDays(monday, 6);
    const pieces = await Promise.all<DraftPiece>([
      api<{ todos: Array<{ completedAt: string | null }> }>(
        `/modules/workspaces/${workspaceSlug}/todo_notes/call/list`,
        { method: 'POST', json: { status: 'done' } },
      )
        .then((data) => {
          const done = data.todos.filter(
            (item) =>
              item.completedAt !== null &&
              item.completedAt.slice(0, 10) >= monday &&
              item.completedAt.slice(0, 10) <= weekEnd,
          ).length;
          return { ok: true, text: `本周完成待办 ${done} 件` };
        })
        .catch(() => ({ ok: false, text: '' })),
      api<{ habits: Array<{ name: string; checkedToday: boolean; streak: number }> }>(
        `/modules/workspaces/${workspaceSlug}/habits/call/snapshot`,
        { method: 'POST', json: {} },
      )
        .then((data) => {
          if (data.habits.length === 0) return { ok: true, text: '习惯打卡尚未开始' };
          const checkedToday = data.habits.filter((item) => item.checkedToday).length;
          const best = Math.max(0, ...data.habits.map((item) => item.streak));
          return {
            ok: true,
            text: `习惯 ${data.habits.length} 项（今日打卡 ${checkedToday}/${data.habits.length}，最佳连续 ${best} 天）`,
          };
        })
        .catch(() => ({ ok: false, text: '' })),
      api<{
        summary: { activeCount: number; avgProgress: number; achievedCount: number };
      }>(`/modules/workspaces/${workspaceSlug}/goals/call/snapshot`, { method: 'POST', json: {} })
        .then((data) => {
          if (data.summary.activeCount === 0) return { ok: true, text: '目标尚未开始' };
          return {
            ok: true,
            text: `进行中目标 ${data.summary.activeCount} 个（平均进度 ${Math.round(data.summary.avgProgress * 100)}%，已全部达成 ${data.summary.achievedCount} 个）`,
          };
        })
        .catch(() => ({ ok: false, text: '' })),
    ]);
    const parts = pieces.filter((piece) => piece.ok && piece.text).map((piece) => piece.text);
    return (
      (parts.length > 0 ? `${parts.join('；')}。` : '本周还没有可引用的模块数据。') +
      '\n\n做得好的：\n可以更好的：\n下周专注的一件事：'
    );
  };
}

/* ---------------- 编辑器（日/周共用） ---------------- */

function EntryEditor({
  kind,
  day,
  mood,
  content,
  aiText,
  aiPolishedAt,
  entryId,
  busy,
  workspaceSlug,
  template,
  onMoodChange,
  onContentChange,
  onSaved,
}: {
  kind: 'daily' | 'weekly';
  day: string;
  mood: number | null;
  content: string;
  aiText: string | null;
  aiPolishedAt: string | null;
  entryId: string | null;
  busy: boolean;
  workspaceSlug: string;
  /** 写作模板（工作空间级设置）：占位提示与「写今天/写本周」预填都来自它 */
  template: string;
  onMoodChange: (mood: number | null) => void;
  onContentChange: (content: string) => void;
  onSaved: (entryId?: string) => void;
}) {
  const { toast } = useToast();
  const [drafting, setDrafting] = useState(false);
  const buildDraft = useWeeklyDraft();

  const save = useMutation({
    mutationFn: () =>
      api<{ entryId: string }>(`/modules/workspaces/${workspaceSlug}/journal/call/saveEntry`, {
        method: 'POST',
        json: { kind, day, mood, content },
      }),
    onSuccess: (data) => {
      toast({ title: '已保存' });
      onSaved(data.entryId);
    },
    onError: (e: Error) => toast({ title: '保存失败', description: e.message, variant: 'err' }),
  });

  const polish = useMutation({
    mutationFn: () =>
      api<{ aiText: string }>(`/modules/workspaces/${workspaceSlug}/journal/call/polishEntry`, {
        method: 'POST',
        json: { entryId },
      }),
    onSuccess: () => {
      toast({ title: '润色完成', description: 'AI 润色稿已存档，原文不动' });
      onSaved(entryId ?? undefined);
    },
    onError: (e: Error) => toast({ title: '润色失败', description: e.message, variant: 'err' }),
  });

  const draft = useMutation({
    mutationFn: () => buildDraft(day, workspaceSlug),
    onSuccess: (text) => {
      onContentChange(text);
      setDrafting(false);
    },
    onError: () => setDrafting(false),
  });

  const canSave = content.trim().length > 0 || mood !== null;

  return (
    <section className="screen-card p-4" aria-label={kind === 'daily' ? '日记编辑' : '周复盘编辑'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {kind === 'daily' ? '今日日记' : '本周复盘'}
            <span className="ml-2 font-mono text-xs font-normal tabular-nums text-muted">
              {kind === 'daily' ? day : weekRange(day)}
            </span>
          </h2>
          {kind === 'weekly' ? (
            <p className="mt-0.5 text-[11px] text-muted">
              周一 {day} 起——写到本周七天里你最有感触的地方。
            </p>
          ) : null}
        </div>
        {kind === 'weekly' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || drafting || draft.isPending}
            loading={draft.isPending}
            onClick={() => {
              setDrafting(true);
              draft.mutate();
            }}
          >
            生成本地草稿
          </Button>
        ) : null}
      </div>

      <div className="mt-3" role="group" aria-label="今天的心情">
        {MOODS.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={busy}
            aria-label={`心情 ${item.label}`}
            aria-pressed={mood === item.value}
            className={`mr-1.5 size-9 rounded-sm border text-lg transition-colors ${
              mood === item.value
                ? 'border-primary/50 bg-primary-soft'
                : 'border-border hover:border-primary/30'
            }`}
            onClick={() => onMoodChange(mood === item.value ? null : item.value)}
          >
            {item.emoji}
          </button>
        ))}
      </div>

      <textarea
        aria-label={kind === 'daily' ? '日记内容' : '周复盘内容'}
        className="mt-3 min-h-40 w-full rounded-sm border border-border bg-bg p-3 text-sm leading-6 outline-none transition-colors focus:border-primary"
        placeholder={template}
        value={content}
        maxLength={5000}
        disabled={busy}
        onChange={(event) => onContentChange(event.target.value)}
      />

      {aiText ? (
        <div className="mt-3 rounded-sm border border-primary/20 bg-primary-soft p-3">
          <p className="screen-label !text-[10px]">
            ✦ AI 润色稿
            {aiPolishedAt
              ? ` · ${new Date(aiPolishedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-text/90">{aiText}</p>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-2">
        {entryId && content.trim().length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || polish.isPending}
            loading={polish.isPending}
            onClick={() => polish.mutate()}
            title="AI 润色（一次调用，结果存档；原文不动）"
          >
            ✦ AI 润色
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={busy || save.isPending || !canSave}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          保存
        </Button>
      </div>
    </section>
  );
}

/* ---------------- 页面 ---------------- */

export function JournalReviewPage({
  workspaceSlug,
  moduleName,
}: {
  workspaceSlug: string;
  moduleName: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  const [monthCursor, setMonthCursor] = useState(0);
  const [editor, setEditor] = useState<{
    kind: 'daily' | 'weekly';
    day: string;
    mood: number | null;
    content: string;
    entryId: string | null;
  }>({ kind: 'daily', day: localDay(), mood: null, content: '', entryId: null });

  const month = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthCursor);
    return monthOf(localDay(d));
  }, [monthCursor]);

  const snapshot = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'snapshot', month],
    queryFn: () =>
      api<JournalSnapshot>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/snapshot`, {
        method: 'POST',
        json: { month },
      }),
  });

  const mutate = useMutation({
    mutationFn: ({ action, json }: { action: string; json?: Record<string, unknown> }) =>
      api<unknown>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/${action}`, {
        method: 'POST',
        json: json ?? {},
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['module', moduleName, workspaceSlug, 'snapshot'],
      });
    },
    onError: (e: Error) => toast({ title: '操作失败', description: e.message, variant: 'err' }),
  });

  // 年视图：切到"年"时才拉取（懒加载）
  const [trendView, setTrendView] = useState<'month' | 'year'>('month');
  const [trendYear, setTrendYear] = useState(() => new Date().getFullYear());
  const yearStats = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'yearSnapshot', trendYear],
    queryFn: () =>
      api<YearStats>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/yearSnapshot`, {
        method: 'POST',
        json: { year: trendYear },
      }),
    enabled: trendView === 'year',
  });

  const data = snapshot.data;
  const busy = mutate.isPending;

  /** 点月列表条目 → 载入编辑器（daily 切日记页签，weekly 切周复盘页签） */
  const loadEntry = (item: EntryView) => {
    setTab(item.kind);
    setEditor({
      kind: item.kind,
      day: item.day,
      mood: item.mood,
      content: item.content,
      entryId: item.id,
    });
  };

  /** 编辑器切换到"今天/本周"的新建状态：内容用写作模板预填（「写今天/写本周」按钮） */
  const newEntry = (kind: 'daily' | 'weekly') => {
    setTab(kind);
    setEditor({
      kind,
      day: kind === 'daily' ? localDay() : currentMonday(),
      mood: null,
      content:
        kind === 'daily'
          ? (data?.options.dailyTemplate ?? '')
          : (data?.options.weeklyTemplate ?? ''),
      entryId: null,
    });
  };

  /** 编辑器切回空白（删除条目后用），不预填模板 */
  const blankEntry = (kind: 'daily' | 'weekly') => {
    setTab(kind);
    setEditor({
      kind,
      day: kind === 'daily' ? localDay() : currentMonday(),
      mood: null,
      content: '',
      entryId: null,
    });
  };

  const editorAi = data?.entries.find((item) => item.id === editor.entryId) ?? null;
  const [templateOpen, setTemplateOpen] = useState(false);
  const [dailyDraft, setDailyDraft] = useState('');
  const [weeklyDraft, setWeeklyDraft] = useState('');
  const openTemplatePanel = () => {
    setDailyDraft(data?.options.dailyTemplate ?? '');
    setWeeklyDraft(data?.options.weeklyTemplate ?? '');
    setTemplateOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">复盘</h1>
        <p className="screen-label mt-0.5 !text-[10px]">Journal · Reflect and grow</p>
      </header>

      {snapshot.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full rounded-md" />
          {[0, 1].map((i) => (
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
            <section aria-label="复盘概览" className="screen-card p-4" role="status">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-semibold tabular-nums text-primary">
                    {String(data.summary.streak).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-muted">连续复盘天数</span>
                </div>
                <div className="flex items-center gap-4 font-mono text-sm tabular-nums text-muted">
                  <span>
                    {data.month.replace('-', '/')} · 日记 {data.summary.monthDaily}
                  </span>
                  <span>周报 {data.summary.monthWeekly}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label="下载月度复盘报告"
                    disabled={snapshot.isPending}
                    onClick={() => {
                      if (!data) return;
                      downloadJournalReport(
                        `journal_report_${data.month}.html`,
                        buildJournalReportHtml({
                          month: data.month,
                          generatedAt: new Date(),
                          entries: data.entries,
                          summary: data.summary,
                        }),
                      );
                    }}
                  >
                    报告
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="上一月"
                    onClick={() => setMonthCursor((c) => c - 1)}
                  >
                    ←
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={monthCursor === 0}
                    aria-label="下一月"
                    onClick={() => setMonthCursor((c) => Math.min(0, c + 1))}
                  >
                    →
                  </Button>
                </div>
              </div>
            </section>

            {/* 心情趋势：月连线 / 年柱状双视图（数据均来自快照聚合，零 AI）；Reveal 滚动显现 */}
            <Reveal index={1}>
              {trendView === 'month' ? (
                <MoodTrendCard entries={data.entries} month={data.month} />
              ) : (
                <section className="screen-card p-4" aria-label="心情趋势">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="screen-label !text-[10px]">Mood trend · 年视图</p>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="上一年"
                        onClick={() => setTrendYear((y) => y - 1)}
                      >
                        ←
                      </Button>
                      <span className="font-mono text-sm tabular-nums text-muted">{trendYear}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={trendYear >= new Date().getFullYear()}
                        aria-label="下一年"
                        onClick={() =>
                          setTrendYear((y) => Math.min(new Date().getFullYear(), y + 1))
                        }
                      >
                        →
                      </Button>
                    </div>
                  </div>
                  {yearStats.isPending ? (
                    <Skeleton className="mt-2 h-28 w-full rounded-sm" />
                  ) : yearStats.isError ? (
                    <p className="mt-2 text-xs text-err" role="alert">
                      年视图加载失败：
                      {yearStats.error instanceof Error ? yearStats.error.message : '请重试'}
                    </p>
                  ) : yearStats.data ? (
                    <>
                      <p className="mt-2 font-mono text-xs tabular-nums text-muted">
                        {yearStats.data.total.days} 天记录 ·{' '}
                        {yearStats.data.total.avgMood !== null
                          ? `平均心情 ${yearStats.data.total.avgMood} / 5`
                          : '还没有心情记录'}
                      </p>
                      <YearMoodChart stats={yearStats.data} />
                    </>
                  ) : null}
                </section>
              )}
              <div className="mt-2 flex justify-end" role="group" aria-label="趋势视图切换">
                <Button
                  size="sm"
                  variant={trendView === 'month' ? 'secondary' : 'ghost'}
                  onClick={() => setTrendView('month')}
                >
                  月
                </Button>
                <Button
                  size="sm"
                  variant={trendView === 'year' ? 'secondary' : 'ghost'}
                  onClick={() => setTrendView('year')}
                >
                  年
                </Button>
              </div>
            </Reveal>

            {/* 模板设置：占位提示与「写今天/写本周」预填都来自这里（工作空间级设置） */}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={templateOpen}
                onClick={() => (templateOpen ? setTemplateOpen(false) : openTemplatePanel())}
              >
                模板设置
              </Button>
            </div>
            {templateOpen ? (
              <div className="screen-card space-y-3 p-4" aria-label="模板设置">
                <p className="text-xs text-muted">
                  模板用于写作占位提示与「写今天 / 写本周」预填；留空保存即恢复默认。
                </p>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">日记模板</span>
                  <textarea
                    aria-label="日记模板"
                    className="min-h-20 w-full rounded-sm border border-border bg-bg p-2.5 text-sm leading-6 outline-none focus:border-primary"
                    value={dailyDraft}
                    maxLength={500}
                    onChange={(event) => setDailyDraft(event.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">周复盘模板</span>
                  <textarea
                    aria-label="周复盘模板"
                    className="min-h-20 w-full rounded-sm border border-border bg-bg p-2.5 text-sm leading-6 outline-none focus:border-primary"
                    value={weeklyDraft}
                    maxLength={500}
                    onChange={(event) => setWeeklyDraft(event.target.value)}
                  />
                </label>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setDailyDraft('');
                      setWeeklyDraft('');
                    }}
                  >
                    恢复默认
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    loading={mutate.isPending}
                    onClick={() =>
                      mutate.mutate(
                        {
                          action: 'saveTemplate',
                          json: { dailyTemplate: dailyDraft, weeklyTemplate: weeklyDraft },
                        },
                        {
                          onSuccess: () => {
                            toast({ title: '模板已保存', variant: 'ok' });
                            void queryClient.invalidateQueries({
                              queryKey: ['module', moduleName, workspaceSlug, 'snapshot'],
                            });
                          },
                        },
                      )
                    }
                  >
                    保存模板
                  </Button>
                </div>
              </div>
            ) : null}

            <Tabs
              value={tab}
              onValueChange={(value) => {
                const kind = value === 'weekly' ? 'weekly' : 'daily';
                // 切页签：编辑器回到该页签的"今天/本周"状态（未保存的草稿不迁移，避免误写）
                setEditor((prev) => ({
                  kind,
                  day: kind === 'daily' ? localDay() : currentMonday(),
                  mood: prev.kind === kind ? prev.mood : null,
                  content: prev.kind === kind ? prev.content : '',
                  entryId: prev.kind === kind ? prev.entryId : null,
                }));
                setTab(kind);
              }}
            >
              <TabsList aria-label="复盘类型">
                <TabsTrigger value="daily">日记</TabsTrigger>
                <TabsTrigger value="weekly">周复盘</TabsTrigger>
              </TabsList>

              <TabsContent value={tab}>
                <div className="mt-3 space-y-4">
                  <EntryEditor
                    key={`${editor.kind}-${editor.day}`}
                    kind={editor.kind}
                    day={editor.day}
                    mood={editor.mood}
                    content={editor.content}
                    entryId={editor.entryId}
                    aiText={editorAi?.aiText ?? null}
                    aiPolishedAt={editorAi?.aiPolishedAt ?? null}
                    busy={busy}
                    workspaceSlug={workspaceSlug}
                    template={
                      editor.kind === 'daily'
                        ? data.options.dailyTemplate
                        : data.options.weeklyTemplate
                    }
                    onMoodChange={(mood) => setEditor((prev) => ({ ...prev, mood }))}
                    onContentChange={(content) => setEditor((prev) => ({ ...prev, content }))}
                    onSaved={(entryId) => {
                      setEditor((prev) => ({ ...prev, entryId: entryId ?? prev.entryId }));
                      void queryClient.invalidateQueries({
                        queryKey: ['module', moduleName, workspaceSlug, 'snapshot'],
                      });
                    }}
                  />

                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted">
                      {editor.entryId
                        ? '正在编辑已有条目'
                        : '新条目——保存后可在下方月列表中点开继续编辑'}
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => newEntry(editor.kind)}>
                      写{editor.kind === 'daily' ? '今天' : '本周'}
                    </Button>
                  </div>

                  {data.entries.length > 0 ? (
                    <section aria-label="本月复盘" className="screen-card p-3">
                      <p className="screen-label px-1 pb-2 !text-[10px]">
                        {month.replace('-', '/')} · 月列表
                      </p>
                      <ul className="divide-y divide-border/60">
                        {data.entries.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="group flex w-full items-center gap-2.5 rounded-sm px-1.5 py-2 text-left transition-colors hover:bg-surface-hover"
                              onClick={() => loadEntry(item)}
                            >
                              <span
                                className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted"
                                aria-hidden
                              >
                                {KIND_LABEL[item.kind]}
                              </span>
                              <span className="font-mono text-xs tabular-nums text-muted">
                                {item.day}
                              </span>
                              <span aria-hidden>{moodEmoji(item.mood)}</span>
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {item.content.split('\n')[0] || '（无正文）'}
                              </span>
                              {item.aiText ? (
                                <span aria-hidden title="含 AI 润色稿">
                                  ✦
                                </span>
                              ) : null}
                              <span
                                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                aria-hidden
                              >
                                ›
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : (
                    <div className="screen-card border-dashed p-8 text-center">
                      <p className="text-2xl" aria-hidden>
                        📝
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {month.replace('-', '/')} 还没有复盘
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        一天三行也行：好事、卡点、明天的第一步。
                      </p>
                    </div>
                  )}

                  {data.archived.length > 0 ? (
                    <section aria-label="已归档" className="screen-card p-3">
                      <p className="screen-label px-1 pb-2 !text-[10px]">已归档</p>
                      <ul className="space-y-1.5">
                        {data.archived.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center gap-2 px-1 text-xs text-muted"
                          >
                            <span
                              className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px]"
                              aria-hidden
                            >
                              {KIND_LABEL[item.kind]}
                            </span>
                            <span className="font-mono tabular-nums">{item.day}</span>
                            <span className="min-w-0 flex-1 truncate">{item.title}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                mutate.mutate({
                                  action: 'restoreEntry',
                                  json: { entryId: item.id },
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

                  {editor.entryId ? (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-err"
                        disabled={busy}
                        onClick={() => {
                          mutate.mutate(
                            { action: 'deleteEntry', json: { entryId: editor.entryId } },
                            {
                              onSuccess: () => {
                                toast({ title: '已移入归档', description: '可在归档区恢复' });
                                blankEntry(editor.kind);
                              },
                            },
                          );
                        }}
                      >
                        删除本条
                      </Button>
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )
      )}
    </div>
  );
}
