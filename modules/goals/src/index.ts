import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ModuleActionError,
  moduleManifestSchema,
  type ModuleContext,
  type ModuleDefinition,
} from '@atlas/sdk';
import { keyResult, objective } from './db/schema';

/**
 * 目标与年度计划（goals）：OKR 式「目标 → 关键结果 → 进度」。
 * 数据模型：objective（软删除归档）+ key_result（number 数值型 / boolean 达成型，软删除）。
 * 目标达成态不落库，由关键结果进度动态推导（避免 KR 回退后状态漂移）。
 * 事件：goal.* / goal.key_result.* 落 outbox，供大屏「今日焦点」等后续订阅。
 */

const manifest = moduleManifestSchema.parse({
  name: 'goals',
  version: '0.1.0',
  title: '目标',
  description: 'OKR 式目标与关键结果：把日常行动指向想去的方向。',
  permissions: ['goals:read', 'goals:write'],
  dependsOn: [],
  routes: [{ path: 'list', title: '目标', nav: { order: 3, icon: '🎯' } }],
  settings: [],
  events: {
    publishes: [
      'goal.created',
      'goal.updated',
      'goal.archived',
      'goal.restored',
      'goal.key_result.created',
      'goal.key_result.updated',
      'goal.key_result.progressed',
      'goal.key_result.deleted',
    ],
    subscribes: [],
  },
  migrations: 'migrations',
});

/* ---------------- 输入校验与周期工具 ---------------- */

const PERIODS = ['year', 'quarter', 'month', 'custom'] as const;
const KR_TYPES = ['number', 'boolean'] as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');

const objectiveIdSchema = z.string().uuid();
const keyResultIdSchema = z.string().uuid();

const createObjectiveSchema = z
  .object({
    title: z.string().trim().min(1, '目标标题不能为空').max(80, '目标标题最长 80 字'),
    description: z.string().trim().max(500, '说明最长 500 字').optional(),
    period: z.enum(PERIODS).default('year'),
    /** 单 emoji（允许带变体选择符），空则用默认 */
    icon: z
      .string()
      .trim()
      .max(8, '图标过长')
      .optional()
      .transform((value) => (value && value.length > 0 ? value : '🎯')),
    /** custom 周期必填起止；其余周期由服务端按当前日期计算边界 */
    startDate: dateStr.optional(),
    endDate: dateStr.optional(),
  })
  .refine((data) => data.period !== 'custom' || (!!data.startDate && !!data.endDate), {
    message: '自定义周期需要开始与结束日期',
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: '开始日期不能晚于结束日期',
  });

const updateObjectiveSchema = z
  .object({
    objectiveId: objectiveIdSchema,
    title: z.string().trim().min(1, '目标标题不能为空').max(80, '目标标题最长 80 字').optional(),
    description: z.string().trim().max(500, '说明最长 500 字').nullable().optional(),
    period: z.enum(PERIODS).optional(),
    icon: z.string().trim().min(1).max(8, '图标过长').optional(),
    startDate: dateStr.optional(),
    endDate: dateStr.optional(),
  })
  .refine((data) => data.period !== 'custom' || (!!data.startDate && !!data.endDate), {
    message: '自定义周期需要开始与结束日期',
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: '开始日期不能晚于结束日期',
  });

const createKeyResultSchema = z
  .object({
    objectiveId: objectiveIdSchema,
    title: z.string().trim().min(1, '关键结果不能为空').max(120, '关键结果最长 120 字'),
    type: z.enum(KR_TYPES),
    startValue: z.number().finite().optional(),
    targetValue: z.number().finite().optional(),
    unit: z.string().trim().max(10, '单位最长 10 字').optional(),
  })
  .refine((data) => data.type !== 'number' || (data.startValue ?? 0) !== (data.targetValue ?? 1), {
    message: '数值型关键结果的起点与目标不能相同',
  });

const updateKeyResultSchema = z.object({
  keyResultId: keyResultIdSchema,
  title: z.string().trim().min(1, '关键结果不能为空').max(120, '关键结果最长 120 字').optional(),
  unit: z.string().trim().max(10, '单位最长 10 字').nullable().optional(),
});

/** 进度更新：number 型给 currentValue，boolean 型给 done */
const progressSchema = z
  .object({
    keyResultId: keyResultIdSchema,
    currentValue: z.number().finite().optional(),
    done: z.boolean().optional(),
  })
  .refine(
    (data) =>
      (data.currentValue === undefined) !== (data.done === undefined) ||
      (data.currentValue === undefined && data.done === undefined),
    { message: 'currentValue 与 done 恰好提供一个' },
  )
  .refine((data) => data.currentValue !== undefined || data.done !== undefined, {
    message: '缺少进度值',
  });

const objectiveIdInput = z.object({ objectiveId: objectiveIdSchema });
const keyResultIdInput = z.object({ keyResultId: keyResultIdSchema });

function bad(message: string): never {
  throw new ModuleActionError(`输入不合法：${message}`);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 按周期类型计算本地时区边界（custom 由调用方提供） */
function periodRange(period: (typeof PERIODS)[number]): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'year') return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
  if (period === 'quarter') {
    const firstMonth = m - (m % 3);
    const lastDay = new Date(y, firstMonth + 3, 0).getDate();
    return {
      startDate: `${y}-${pad(firstMonth + 1)}-01`,
      endDate: `${y}-${pad(firstMonth + 3)}-${pad(lastDay)}`,
    };
  }
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { startDate: `${y}-${pad(m + 1)}-01`, endDate: `${y}-${pad(m + 1)}-${pad(lastDay)}` };
}

/** 关键结果进度 0–1：boolean 看完成标记；number 双向夹取（支持「从 75 减到 70」这类反向目标） */
function krProgress(row: {
  type: string;
  completedAt: Date | null;
  startValue: number;
  targetValue: number;
  currentValue: number;
}): number {
  if (row.type === 'boolean') return row.completedAt ? 1 : 0;
  const span = row.targetValue - row.startValue;
  if (span === 0) return row.completedAt ? 1 : 0;
  return Math.min(1, Math.max(0, (row.currentValue - row.startValue) / span));
}

/** 数值型是否抵达目标（用于 completedAt 维护） */
function numberReached(row: {
  startValue: number;
  targetValue: number;
  currentValue: number;
}): boolean {
  return row.targetValue >= row.startValue
    ? row.currentValue >= row.targetValue
    : row.currentValue <= row.targetValue;
}

/** 数据库 period 列（text）收窄回受控枚举；脏值回落 year */
function asPeriod(value: string): (typeof PERIODS)[number] {
  return (PERIODS as readonly string[]).includes(value)
    ? (value as (typeof PERIODS)[number])
    : 'year';
}

/** 校验目标归属当前工作区，返回行 */
async function ownedObjective(ctx: ModuleContext, objectiveId: string, requireActive: boolean) {
  const rows = await ctx.db
    .select()
    .from(objective)
    .where(and(eq(objective.id, objectiveId), eq(objective.workspaceId, ctx.workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) bad('目标不存在或已被删除');
  if (requireActive && row.archivedAt) bad('该目标已归档');
  return row;
}

/** 校验关键结果归属当前工作区且其目标未归档，返回行 */
async function ownedKeyResult(ctx: ModuleContext, keyResultId: string) {
  const rows = await ctx.db
    .select()
    .from(keyResult)
    .where(and(eq(keyResult.id, keyResultId), eq(keyResult.workspaceId, ctx.workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row || row.deletedAt) bad('关键结果不存在或已被删除');
  await ownedObjective(ctx, row.objectiveId, true);
  return row;
}

/* ---------------- 快照组装 ---------------- */

export interface KeyResultView {
  id: string;
  objectiveId: string;
  title: string;
  type: 'number' | 'boolean';
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  done: boolean;
  /** 0–1 */
  progress: number;
}

export interface ObjectiveView {
  id: string;
  title: string;
  description: string | null;
  period: string;
  startDate: string;
  endDate: string;
  icon: string;
  keyResults: KeyResultView[];
  /** 关键结果平均进度；无关键结果时为 0 */
  progress: number;
  /** 有关键结果且全部达成 */
  achieved: boolean;
}

export interface GoalsSnapshot {
  objectives: ObjectiveView[];
  archived: { id: string; title: string; icon: string }[];
  summary: {
    /** 进行中（未归档）目标数 */
    activeCount: number;
    achievedCount: number;
    /** 进行中目标的平均进度（无目标时 0） */
    avgProgress: number;
    keyResultTotal: number;
    keyResultDone: number;
  };
}

async function buildSnapshot(ctx: ModuleContext): Promise<GoalsSnapshot> {
  const [objRows, krRows] = await Promise.all([
    ctx.db
      .select()
      .from(objective)
      .where(eq(objective.workspaceId, ctx.workspaceId))
      .orderBy(asc(objective.sortOrder), asc(objective.createdAt)),
    ctx.db
      .select()
      .from(keyResult)
      .where(and(eq(keyResult.workspaceId, ctx.workspaceId), isNull(keyResult.deletedAt))),
  ]);

  const krByObjective = new Map<string, typeof krRows>();
  for (const row of krRows) {
    const list = krByObjective.get(row.objectiveId) ?? [];
    list.push(row);
    krByObjective.set(row.objectiveId, list);
  }

  const toKrView = (row: (typeof krRows)[number]): KeyResultView => ({
    id: row.id,
    objectiveId: row.objectiveId,
    title: row.title,
    type: row.type === 'boolean' ? 'boolean' : 'number',
    startValue: row.startValue,
    targetValue: row.targetValue,
    currentValue: row.currentValue,
    unit: row.unit,
    done: row.type === 'boolean' ? !!row.completedAt : numberReached(row),
    progress: krProgress(row),
  });

  const toObjectiveView = (row: (typeof objRows)[number]): ObjectiveView => {
    const krs = (krByObjective.get(row.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map(toKrView);
    const progress =
      krs.length > 0 ? krs.reduce((sum, kr) => sum + kr.progress, 0) / krs.length : 0;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      period: row.period,
      startDate: row.startDate,
      endDate: row.endDate,
      icon: row.icon,
      keyResults: krs,
      progress,
      achieved: krs.length > 0 && krs.every((kr) => kr.progress >= 1),
    };
  };

  const active = objRows.filter((row) => !row.archivedAt).map(toObjectiveView);
  const archived = objRows
    .filter((row) => row.archivedAt)
    .map((row) => ({ id: row.id, title: row.title, icon: row.icon }));
  const allKrs = active.flatMap((item) => item.keyResults);

  return {
    objectives: active,
    archived,
    summary: {
      activeCount: active.length,
      achievedCount: active.filter((item) => item.achieved).length,
      avgProgress:
        active.length > 0
          ? active.reduce((sum, item) => sum + item.progress, 0) / active.length
          : 0,
      keyResultTotal: allKrs.length,
      keyResultDone: allKrs.filter((kr) => kr.progress >= 1).length,
    },
  };
}

/* ---------------- 模块定义 ---------------- */

export const definition: ModuleDefinition = {
  manifest,
  actions: {
    /** 全量快照：进行中目标（含关键结果与进度）+ 归档区 + 汇总指标 */
    snapshot: {
      permission: 'goals:read',
      handler: async (ctx) => buildSnapshot(ctx),
    },

    createObjective: {
      permission: 'goals:write',
      handler: async (ctx, input) => {
        const parsed = createObjectiveSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const data = parsed.data;
        const range =
          data.period === 'custom'
            ? { startDate: data.startDate!, endDate: data.endDate! }
            : periodRange(data.period);
        const maxOrder = await ctx.db
          .select({ max: sql<number>`coalesce(max(${objective.sortOrder}), 0)` })
          .from(objective)
          .where(eq(objective.workspaceId, ctx.workspaceId));
        const inserted = await ctx.db
          .insert(objective)
          .values({
            workspaceId: ctx.workspaceId,
            title: data.title,
            description: data.description ?? null,
            period: data.period,
            startDate: range.startDate,
            endDate: range.endDate,
            icon: data.icon,
            sortOrder: (maxOrder[0]?.max ?? 0) + 1,
          })
          .returning({ id: objective.id });
        const objectiveId = inserted[0]?.id;
        if (!objectiveId) bad('创建失败，请重试');
        await ctx.events.publish('goal.created', { objectiveId });
        return buildSnapshot(ctx);
      },
    },

    updateObjective: {
      permission: 'goals:write',
      handler: async (ctx, input) => {
        const parsed = updateObjectiveSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const data = parsed.data;
        const row = await ownedObjective(ctx, data.objectiveId, true);
        const period = data.period ?? asPeriod(row.period);
        const range =
          period === 'custom'
            ? { startDate: data.startDate ?? row.startDate, endDate: data.endDate ?? row.endDate }
            : periodRange(period);
        await ctx.db
          .update(objective)
          .set({
            title: data.title ?? row.title,
            description:
              data.description === undefined ? row.description : (data.description ?? null),
            icon: data.icon ?? row.icon,
            period,
            startDate: range.startDate,
            endDate: range.endDate,
            updatedAt: new Date(),
          })
          .where(eq(objective.id, row.id));
        await ctx.events.publish('goal.updated', { objectiveId: row.id });
        return buildSnapshot(ctx);
      },
    },

    /** 软删除（归档）：关键结果保留，可恢复 */
    archiveObjective: {
      permission: 'goals:write',
      handler: async (ctx, input) => {
        const parsed = objectiveIdInput.safeParse(input ?? {});
        if (!parsed.success) bad('目标 ID 不合法');
        const row = await ownedObjective(ctx, parsed.data.objectiveId, true);
        await ctx.db
          .update(objective)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(objective.id, row.id));
        await ctx.events.publish('goal.archived', { objectiveId: row.id });
        return buildSnapshot(ctx);
      },
    },

    restoreObjective: {
      permission: 'goals:write',
      handler: async (ctx, input) => {
        const parsed = objectiveIdInput.safeParse(input ?? {});
        if (!parsed.success) bad('目标 ID 不合法');
        const row = await ownedObjective(ctx, parsed.data.objectiveId, false);
        if (row.archivedAt) {
          await ctx.db
            .update(objective)
            .set({ archivedAt: null, updatedAt: new Date() })
            .where(eq(objective.id, row.id));
          await ctx.events.publish('goal.restored', { objectiveId: row.id });
        }
        return buildSnapshot(ctx);
      },
    },

    createKeyResult: {
      permission: 'goals:write',
      handler: async (ctx, input) => {
        const parsed = createKeyResultSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const data = parsed.data;
        await ownedObjective(ctx, data.objectiveId, true);
        const maxOrder = await ctx.db
          .select({ max: sql<number>`coalesce(max(${keyResult.sortOrder}), 0)` })
          .from(keyResult)
          .where(and(eq(keyResult.objectiveId, data.objectiveId), isNull(keyResult.deletedAt)));
        const isNumber = data.type === 'number';
        const startValue = isNumber ? (data.startValue ?? 0) : 0;
        const targetValue = isNumber ? (data.targetValue ?? 1) : 1;
        const inserted = await ctx.db
          .insert(keyResult)
          .values({
            workspaceId: ctx.workspaceId,
            objectiveId: data.objectiveId,
            title: data.title,
            type: data.type,
            startValue,
            targetValue,
            currentValue: startValue,
            unit: isNumber ? (data.unit ?? null) : null,
            sortOrder: (maxOrder[0]?.max ?? 0) + 1,
          })
          .returning({ id: keyResult.id });
        const keyResultId = inserted[0]?.id;
        if (!keyResultId) bad('创建失败，请重试');
        await ctx.events.publish('goal.key_result.created', {
          keyResultId,
          objectiveId: data.objectiveId,
        });
        return buildSnapshot(ctx);
      },
    },

    /** 改标题/单位；类型不可改（进度语义不同），换类型请删除后重建 */
    updateKeyResult: {
      permission: 'goals:write',
      handler: async (ctx, input) => {
        const parsed = updateKeyResultSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const data = parsed.data;
        const row = await ownedKeyResult(ctx, data.keyResultId);
        await ctx.db
          .update(keyResult)
          .set({
            title: data.title ?? row.title,
            unit: data.unit === undefined ? row.unit : (data.unit ?? null),
            updatedAt: new Date(),
          })
          .where(eq(keyResult.id, row.id));
        await ctx.events.publish('goal.key_result.updated', {
          keyResultId: row.id,
          objectiveId: row.objectiveId,
        });
        return buildSnapshot(ctx);
      },
    },

    /** 进度更新：number 型写 currentValue（抵达目标自动落 completedAt，回落自动清） */
    updateKeyResultProgress: {
      permission: 'goals:write',
      handler: async (ctx, input) => {
        const parsed = progressSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const data = parsed.data;
        const row = await ownedKeyResult(ctx, data.keyResultId);
        if (row.type === 'boolean') {
          const completedAt = data.done ? new Date() : null;
          await ctx.db
            .update(keyResult)
            .set({ completedAt, updatedAt: new Date() })
            .where(eq(keyResult.id, row.id));
          await ctx.events.publish('goal.key_result.progressed', {
            keyResultId: row.id,
            objectiveId: row.objectiveId,
            progress: completedAt ? 1 : 0,
          });
        } else {
          const currentValue = data.currentValue ?? row.currentValue;
          const completedAt = numberReached({ ...row, currentValue }) ? new Date() : null;
          await ctx.db
            .update(keyResult)
            .set({ currentValue, completedAt, updatedAt: new Date() })
            .where(eq(keyResult.id, row.id));
          await ctx.events.publish('goal.key_result.progressed', {
            keyResultId: row.id,
            objectiveId: row.objectiveId,
            progress: krProgress({ ...row, currentValue, completedAt }),
          });
        }
        return buildSnapshot(ctx);
      },
    },

    /** 软删除：目标恢复不连带复活已删的关键结果（保留用户意图） */
    deleteKeyResult: {
      permission: 'goals:write',
      handler: async (ctx, input) => {
        const parsed = keyResultIdInput.safeParse(input ?? {});
        if (!parsed.success) bad('关键结果 ID 不合法');
        const row = await ownedKeyResult(ctx, parsed.data.keyResultId);
        await ctx.db
          .update(keyResult)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(keyResult.id, row.id));
        await ctx.events.publish('goal.key_result.deleted', {
          keyResultId: row.id,
          objectiveId: row.objectiveId,
        });
        return buildSnapshot(ctx);
      },
    },
  },
};
