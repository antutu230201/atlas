import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ModuleActionError,
  moduleManifestSchema,
  type ModuleContext,
  type ModuleDefinition,
} from '@atlas/sdk';
import { habit, habitLog } from './db/schema';

/**
 * 习惯打卡（habits）：自定义每日习惯、一键打卡、连续天数与近程热力格。
 * 数据模型：habit（软删除归档）+ habit_log（habit+day 唯一，一天一条）。
 * 事件：habit.checked / habit.unchecked 供其他模块（如大屏）订阅，模块间不直读表。
 */

const manifest = moduleManifestSchema.parse({
  name: 'habits',
  version: '0.1.0',
  title: '习惯打卡',
  description: '自定义每日习惯、一键打卡、连续天数与近程热力格。',
  permissions: ['habits:read', 'habits:write'],
  dependsOn: [],
  routes: [{ path: 'today', title: '习惯', nav: { order: 2, icon: '🔥' } }],
  settings: [],
  events: {
    publishes: [
      'habit.created',
      'habit.renamed',
      'habit.checked',
      'habit.unchecked',
      'habit.archived',
      'habit.restored',
    ],
    subscribes: [],
  },
  migrations: 'migrations',
});

/* ---------------- 输入校验与时区工具 ---------------- */

const habitIdSchema = z.string().uuid();
const createSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(40, '名称最长 40 字'),
  /** 单个 emoji（允许带变体选择符），空则用默认 */
  icon: z
    .string()
    .trim()
    .max(8, '图标过长')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : '✅')),
});
const renameSchema = createSchema.extend({ habitId: habitIdSchema });
const idSchema = z.object({ habitId: habitIdSchema });

/** 本地时区 YYYY-MM-DD（与 dashboard.activity 的 day 口径一致） */
function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayOffset(days: number): string {
  return localDay(new Date(Date.now() - days * 86_400_000));
}

/** 近 7 天的日期序列（旧 → 今天） */
function lastSevenDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => dayOffset(6 - i)).filter((day) => day <= today);
}

/** 连续打卡天数：从今天（未打则从昨天）向前连续有记录的天数 */
function computeStreak(checkedDays: Set<string>, today: string): number {
  let cursor = new Date(`${today}T00:00:00`);
  if (!checkedDays.has(localDay(cursor))) {
    cursor = new Date(cursor.getTime() - 86_400_000);
    if (!checkedDays.has(localDay(cursor))) return 0;
  }
  let streak = 0;
  while (checkedDays.has(localDay(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

function bad(message: string): never {
  throw new ModuleActionError(`输入不合法：${message}`);
}

/** 校验习惯归属当前工作区且未归档，返回行 */
async function ownedHabit(ctx: ModuleContext, habitId: string, requireActive: boolean) {
  const rows = await ctx.db
    .select()
    .from(habit)
    .where(and(eq(habit.id, habitId), eq(habit.workspaceId, ctx.workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) bad('习惯不存在或已被删除');
  if (requireActive && row.archivedAt) bad('该习惯已归档');
  return row;
}

/* ---------------- 快照组装 ---------------- */

export interface HabitView {
  id: string;
  name: string;
  icon: string;
  checkedToday: boolean;
  streak: number;
  /** 近 7 天（旧 → 今天） */
  week: { day: string; checked: boolean }[];
}

export interface HabitsSnapshot {
  today: string;
  habits: HabitView[];
  archived: { id: string; name: string; icon: string }[];
  /** 今日已打卡 / 活跃习惯总数 */
  doneToday: number;
  totalToday: number;
}

async function buildSnapshot(ctx: ModuleContext): Promise<HabitsSnapshot> {
  const today = localDay();
  const windowStart = dayOffset(69); // 连续天数最多回看 10 周，足够

  const [habitRows, logRows] = await Promise.all([
    ctx.db
      .select()
      .from(habit)
      .where(eq(habit.workspaceId, ctx.workspaceId))
      .orderBy(asc(habit.sortOrder), asc(habit.createdAt)),
    ctx.db
      .select({ habitId: habitLog.habitId, day: habitLog.day })
      .from(habitLog)
      .where(and(eq(habitLog.workspaceId, ctx.workspaceId), gte(habitLog.day, windowStart))),
  ]);

  const logsByHabit = new Map<string, Set<string>>();
  for (const row of logRows) {
    const set = logsByHabit.get(row.habitId) ?? new Set<string>();
    set.add(row.day);
    logsByHabit.set(row.habitId, set);
  }

  const week = lastSevenDays(today);
  const toView = (row: (typeof habitRows)[number]): HabitView => {
    const days = logsByHabit.get(row.id) ?? new Set<string>();
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      checkedToday: days.has(today),
      streak: computeStreak(days, today),
      week: week.map((day) => ({ day, checked: days.has(day) })),
    };
  };

  const active = habitRows.filter((row) => !row.archivedAt).map(toView);
  const archived = habitRows
    .filter((row) => row.archivedAt)
    .map((row) => ({ id: row.id, name: row.name, icon: row.icon }));

  return {
    today,
    habits: active,
    archived,
    doneToday: active.filter((item) => item.checkedToday).length,
    totalToday: active.length,
  };
}

/* ---------------- 模块定义 ---------------- */

export const definition: ModuleDefinition = {
  manifest,
  actions: {
    /** 全量快照：活跃+已归档习惯、今日打卡态、连续天数、近 7 天格子 */ snapshot: {
      permission: 'habits:read',
      handler: async (ctx) => buildSnapshot(ctx),
    },

    createHabit: {
      permission: 'habits:write',
      handler: async (ctx, input) => {
        const parsed = createSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const maxOrder = await ctx.db
          .select({ max: sql<number>`coalesce(max(${habit.sortOrder}), 0)` })
          .from(habit)
          .where(eq(habit.workspaceId, ctx.workspaceId));
        const inserted = await ctx.db
          .insert(habit)
          .values({
            workspaceId: ctx.workspaceId,
            name: parsed.data.name,
            icon: parsed.data.icon,
            sortOrder: (maxOrder[0]?.max ?? 0) + 1,
          })
          .returning({ id: habit.id });
        const habitId = inserted[0]?.id;
        if (!habitId) bad('创建失败，请重试');
        await ctx.events.publish('habit.created', { habitId });
        return buildSnapshot(ctx);
      },
    },

    renameHabit: {
      permission: 'habits:write',
      handler: async (ctx, input) => {
        const parsed = renameSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const row = await ownedHabit(ctx, parsed.data.habitId, true);
        await ctx.db
          .update(habit)
          .set({ name: parsed.data.name, icon: parsed.data.icon, updatedAt: new Date() })
          .where(eq(habit.id, row.id));
        await ctx.events.publish('habit.renamed', { habitId: row.id });
        return buildSnapshot(ctx);
      },
    },

    /** 打卡 / 取消打卡（幂等：重复打卡仍返回快照） */
    toggleCheck: {
      permission: 'habits:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input ?? {});
        if (!parsed.success) bad('习惯 ID 不合法');
        const row = await ownedHabit(ctx, parsed.data.habitId, true);
        const day = localDay();
        const existing = await ctx.db
          .select({ id: habitLog.id })
          .from(habitLog)
          .where(and(eq(habitLog.habitId, row.id), eq(habitLog.day, day)))
          .limit(1);
        const existingLog = existing[0];
        if (existingLog) {
          await ctx.db.delete(habitLog).where(eq(habitLog.id, existingLog.id));
          await ctx.events.publish('habit.unchecked', { habitId: row.id, day });
        } else {
          await ctx.db
            .insert(habitLog)
            .values({ workspaceId: ctx.workspaceId, habitId: row.id, day })
            .onConflictDoNothing();
          await ctx.events.publish('habit.checked', { habitId: row.id, day });
        }
        return buildSnapshot(ctx);
      },
    },

    /** 软删除（归档）：保留历史记录，可恢复 */
    archiveHabit: {
      permission: 'habits:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input ?? {});
        if (!parsed.success) bad('习惯 ID 不合法');
        const row = await ownedHabit(ctx, parsed.data.habitId, true);
        await ctx.db
          .update(habit)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(habit.id, row.id));
        await ctx.events.publish('habit.archived', { habitId: row.id });
        return buildSnapshot(ctx);
      },
    },

    restoreHabit: {
      permission: 'habits:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input ?? {});
        if (!parsed.success) bad('习惯 ID 不合法');
        const rows = await ctx.db
          .select()
          .from(habit)
          .where(and(eq(habit.id, parsed.data.habitId), eq(habit.workspaceId, ctx.workspaceId)))
          .limit(1);
        const row = rows[0];
        if (!row) bad('习惯不存在或已被删除');
        if (row.archivedAt) {
          await ctx.db
            .update(habit)
            .set({ archivedAt: null, updatedAt: new Date() })
            .where(eq(habit.id, row.id));
          await ctx.events.publish('habit.restored', { habitId: row.id });
        }
        return buildSnapshot(ctx);
      },
    },
  },
};
