import { and, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ModuleActionError,
  moduleManifestSchema,
  type ModuleContext,
  type ModuleDefinition,
} from '@atlas/sdk';
import { entry } from './db/schema';

/**
 * 复盘日记（journal）：每日/每周模板复盘、心情五档、月度列表与归档恢复。
 * 降本约定（2026-11-14）：本地模板与数据聚合零 AI；polishEntry 是唯一的 AI 消耗点，
 * 仅显式触发（一次调用、结果入库存档），Mock 未配置时明确拒绝。
 * 数据模型：entry（(workspace, kind, day) 部分唯一 = 保存即 upsert；软删除可恢复）。
 */

/** 写作模板默认值（manifest 声明与快照回落共用） */
export const DEFAULT_DAILY_TEMPLATE = '今天的三件好事：\n卡住的地方：\n明天最重要的一件事：';
export const DEFAULT_WEEKLY_TEMPLATE = '本周做得好的：\n可以更好的：\n下周专注的一件事：';

const manifest = moduleManifestSchema.parse({
  name: 'journal',
  version: '0.1.0',
  title: '复盘',
  description: '每日与每周复盘：心情、模板写作、月度回顾；AI 润色可选。',
  permissions: ['journal:read', 'journal:write'],
  dependsOn: [],
  routes: [{ path: 'review', title: '复盘', nav: { order: 4, icon: '📝' } }],
  settings: [
    { key: 'dailyTemplate', label: '日记模板', type: 'text', default: DEFAULT_DAILY_TEMPLATE },
    { key: 'weeklyTemplate', label: '周复盘模板', type: 'text', default: DEFAULT_WEEKLY_TEMPLATE },
  ],
  events: {
    publishes: ['journal.saved', 'journal.polished', 'journal.deleted', 'journal.restored'],
    subscribes: [],
  },
  migrations: 'migrations',
});

/* ---------------- 输入校验与工具 ---------------- */

const KINDS = ['daily', 'weekly'] as const;
type Kind = (typeof KINDS)[number];

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
  .refine(
    (value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()),
    '日期不合法（如 2026-13-99）',
  );
const monthStr = z.string().regex(/^\d{4}-\d{2}$/, '月份格式应为 YYYY-MM');
const idSchema = z.object({ entryId: z.string().uuid() });

/* 写作模板设置（工作空间级）：空值回落默认；上限与内容一致 */
const settingsSchema = z.object({
  dailyTemplate: z.string().max(500).optional(),
  weeklyTemplate: z.string().max(500).optional(),
});

type JournalSettings = z.infer<typeof settingsSchema>;

function parseSettings(raw: Record<string, unknown>): JournalSettings & {
  dailyTemplate: string;
  weeklyTemplate: string;
} {
  const parsed = settingsSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : {};
  return {
    dailyTemplate: value.dailyTemplate || DEFAULT_DAILY_TEMPLATE,
    weeklyTemplate: value.weeklyTemplate || DEFAULT_WEEKLY_TEMPLATE,
  };
}

const saveTemplateSchema = z.object({
  dailyTemplate: z.string().max(500, '日记模板最长 500 字').optional(),
  weeklyTemplate: z.string().max(500, '周复盘模板最长 500 字').optional(),
});

const saveSchema = z
  .object({
    kind: z.enum(KINDS),
    day: dateStr,
    mood: z.number().int().min(1).max(5).nullable().optional(),
    content: z.string().max(5000, '内容最长 5000 字').default(''),
  })
  .refine((data) => data.kind !== 'weekly' || isMonday(data.day), {
    message: '周复盘的日期必须是周一',
  });

function isMonday(day: string): boolean {
  const d = new Date(`${day}T00:00:00`);
  return d.getDay() === 1;
}

function bad(message: string): never {
  throw new ModuleActionError(`输入不合法：${message}`);
}

function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 本地时区当前周的周一 */
function currentMonday(): string {
  const now = new Date();
  const offset = (now.getDay() + 6) % 7;
  return localDay(new Date(now.getTime() - offset * 86_400_000));
}

/** 校验条目归属当前工作区（含软删），返回行 */
async function ownedEntry(ctx: ModuleContext, entryId: string) {
  const rows = await ctx.db
    .select()
    .from(entry)
    .where(and(eq(entry.id, entryId), eq(entry.workspaceId, ctx.workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) bad('复盘条目不存在或已被删除');
  return row;
}

/* ---------------- 快照组装 ---------------- */

export interface EntryView {
  id: string;
  kind: Kind;
  day: string;
  mood: number | null;
  content: string;
  aiText: string | null;
  aiPolishedAt: string | null;
  updatedAt: string;
}

export interface JournalSnapshot {
  month: string;
  entries: EntryView[];
  archived: { id: string; kind: Kind; day: string; title: string }[];
  summary: {
    /** 本月日记篇数 */
    monthDaily: number;
    /** 本月周报篇数 */
    monthWeekly: number;
    /** 连续复盘天数（今天未写不断签，从昨天起算） */
    streak: number;
    currentMonday: string;
  };
  /** 日记/周复盘写作模板（工作空间级设置，saveTemplate 修改；空值回落默认） */
  options: {
    dailyTemplate: string;
    weeklyTemplate: string;
  };
}

export interface YearStats {
  year: number;
  months: Array<{ month: string; days: number; avgMood: number | null; weeklies: number }>;
  total: { days: number; avgMood: number | null };
}

function toView(row: typeof entry.$inferSelect): EntryView {
  return {
    id: row.id,
    kind: row.kind === 'weekly' ? 'weekly' : 'daily',
    day: row.day,
    mood: row.mood,
    content: row.content,
    aiText: row.aiText,
    aiPolishedAt: row.aiPolishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 复盘卡标题：截取内容首行/前 24 字 */
function titleOf(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  return trimmed.length > 0
    ? trimmed.length > 24
      ? `${trimmed.slice(0, 24)}…`
      : trimmed
    : '（无正文）';
}

async function buildSnapshot(ctx: ModuleContext, month: string): Promise<JournalSnapshot> {
  const monthStart = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const monthEnd = localDay(new Date(y!, m!, 0)); // 当月最后一天

  const [activeRows, archivedRows] = await Promise.all([
    ctx.db
      .select()
      .from(entry)
      .where(
        and(
          eq(entry.workspaceId, ctx.workspaceId),
          isNull(entry.deletedAt),
          gte(entry.day, monthStart),
          lte(entry.day, monthEnd),
        ),
      )
      .orderBy(desc(entry.day)),
    ctx.db
      .select()
      .from(entry)
      .where(and(eq(entry.workspaceId, ctx.workspaceId), isNotNull(entry.deletedAt)))
      .orderBy(desc(entry.deletedAt))
      .limit(20),
  ]);

  // 连续复盘天数：今天未写不断签，从昨天起算（简单连续，无宽免）
  const dailyDays = new Set(activeRows.filter((row) => row.kind === 'daily').map((row) => row.day));
  let streak = 0;
  const cursor = new Date();
  if (!dailyDays.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dailyDays.has(localDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const templates = parseSettings(await ctx.settings.get());

  return {
    month,
    entries: activeRows.map(toView),
    archived: archivedRows.map((row) => ({
      id: row.id,
      kind: row.kind === 'weekly' ? 'weekly' : 'daily',
      day: row.day,
      title: titleOf(row.content),
    })),
    summary: {
      monthDaily: activeRows.filter((row) => row.kind === 'daily').length,
      monthWeekly: activeRows.filter((row) => row.kind === 'weekly').length,
      streak,
      currentMonday: currentMonday(),
    },
    options: {
      dailyTemplate: templates.dailyTemplate,
      weeklyTemplate: templates.weeklyTemplate,
    },
  };
}

/* ---------------- 模块定义 ---------------- */

export const definition: ModuleDefinition = {
  manifest,
  actions: {
    /** 月度快照：本月条目（日+周）+ 归档区 + 汇总指标 */
    snapshot: {
      permission: 'journal:read',
      handler: async (ctx, input) => {
        const parsed = z.object({ month: monthStr.optional() }).safeParse(input ?? {});
        if (!parsed.success) bad('月份格式应为 YYYY-MM');
        const month = parsed.data.month ?? localDay().slice(0, 7);
        return buildSnapshot(ctx, month);
      },
    },

    /** 年视图统计：12 个月的记录天数 / 平均心情 / 周报篇数（纯聚合，零 AI） */
    yearSnapshot: {
      permission: 'journal:read',
      handler: async (ctx, input) => {
        const parsed = z
          .object({ year: z.number().int().min(2000).max(2100).optional() })
          .safeParse(input ?? {});
        if (!parsed.success) bad('年份不合法');
        const year = parsed.data.year ?? new Date().getFullYear();
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;

        const rows = await ctx.db
          .select({
            month: sql<string>`substr(${entry.day}::text, 1, 7)`,
            days: sql<number>`count(distinct case when ${entry.kind} = 'daily' then ${entry.day} end)::int`,
            avgMood: sql<
              number | null
            >`avg(case when ${entry.kind} = 'daily' and ${entry.mood} is not null then ${entry.mood} end)`,
            weeklies: sql<number>`count(case when ${entry.kind} = 'weekly' then 1 end)::int`,
          })
          .from(entry)
          .where(
            and(
              eq(entry.workspaceId, ctx.workspaceId),
              isNull(entry.deletedAt),
              gte(entry.day, yearStart),
              lte(entry.day, yearEnd),
            ),
          )
          .groupBy(sql`substr(${entry.day}::text, 1, 7)`);

        const byMonth = new Map(rows.map((row) => [row.month, row]));
        const months = Array.from({ length: 12 }, (_, index) => {
          const key = `${year}-${String(index + 1).padStart(2, '0')}`;
          const row = byMonth.get(key);
          return {
            month: key,
            days: row?.days ?? 0,
            avgMood: row?.avgMood != null ? Math.round(row.avgMood * 10) / 10 : null,
            weeklies: row?.weeklies ?? 0,
          };
        });
        const yearDays = months.reduce((sum, month) => sum + month.days, 0);
        const moodMonths = months.filter((month) => month.avgMood !== null);
        const yearAvgMood =
          moodMonths.length > 0
            ? Math.round(
                (moodMonths.reduce((sum, month) => sum + (month.avgMood ?? 0), 0) /
                  moodMonths.length) *
                  10,
              ) / 10
            : null;

        return { year, months, total: { days: yearDays, avgMood: yearAvgMood } };
      },
    },

    /** 保存（upsert）：同 kind+day 已有活跃条目则更新；正文变化时清除过期润色稿 */
    saveEntry: {
      permission: 'journal:write',
      handler: async (ctx, input) => {
        const parsed = saveSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const data = parsed.data;

        const existing = await ctx.db
          .select()
          .from(entry)
          .where(
            and(
              eq(entry.workspaceId, ctx.workspaceId),
              eq(entry.kind, data.kind),
              eq(entry.day, data.day),
              isNull(entry.deletedAt),
            ),
          )
          .limit(1);

        let entryId: string;
        const current = existing[0];
        if (current) {
          const contentChanged = current.content !== data.content;
          await ctx.db
            .update(entry)
            .set({
              mood: data.mood ?? null,
              content: data.content,
              // 润色稿对应旧原文：正文变化即清除，避免误导
              aiText: contentChanged ? null : current.aiText,
              aiPolishedAt: contentChanged ? null : current.aiPolishedAt,
              updatedAt: new Date(),
            })
            .where(eq(entry.id, current.id));
          entryId = current.id;
        } else {
          const inserted = await ctx.db
            .insert(entry)
            .values({
              workspaceId: ctx.workspaceId,
              kind: data.kind,
              day: data.day,
              mood: data.mood ?? null,
              content: data.content,
            })
            .returning({ id: entry.id });
          entryId = inserted[0]?.id ?? '';
          if (!entryId) bad('保存失败，请重试');
        }
        await ctx.events.publish('journal.saved', { entryId, kind: data.kind, day: data.day });
        return { entryId };
      },
    },

    /** 软删除：进入归档区，可恢复 */
    deleteEntry: {
      permission: 'journal:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input ?? {});
        if (!parsed.success) bad('条目 ID 不合法');
        const row = await ownedEntry(ctx, parsed.data.entryId);
        if (!row.deletedAt) {
          await ctx.db
            .update(entry)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(entry.id, row.id));
          await ctx.events.publish('journal.deleted', { entryId: row.id });
        }
        return { ok: true };
      },
    },

    restoreEntry: {
      permission: 'journal:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input ?? {});
        if (!parsed.success) bad('条目 ID 不合法');
        const row = await ownedEntry(ctx, parsed.data.entryId);
        if (row.deletedAt) {
          // 同周期可能已有新条目占位（部分唯一索引）：冲突时拒绝并提示
          const clash = await ctx.db
            .select({ id: entry.id })
            .from(entry)
            .where(
              and(
                eq(entry.workspaceId, ctx.workspaceId),
                eq(entry.kind, row.kind),
                eq(entry.day, row.day),
                isNull(entry.deletedAt),
              ),
            )
            .limit(1);
          if (clash[0]) bad('该日期已有一条复盘，先删除它再恢复这条');
          await ctx.db
            .update(entry)
            .set({ deletedAt: null, updatedAt: new Date() })
            .where(eq(entry.id, row.id));
          await ctx.events.publish('journal.restored', { entryId: row.id });
        }
        return { ok: true };
      },
    },

    /** 保存写作模板（工作空间级设置）：空串 = 恢复默认模板 */
    saveTemplate: {
      permission: 'journal:write',
      handler: async (ctx, input) => {
        const parsed = saveTemplateSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues[0]?.message ?? '参数错误');
        const patch: Record<string, string> = {};
        if (parsed.data.dailyTemplate !== undefined)
          patch.dailyTemplate = parsed.data.dailyTemplate;
        if (parsed.data.weeklyTemplate !== undefined) {
          patch.weeklyTemplate = parsed.data.weeklyTemplate;
        }
        await ctx.settings.set(patch);
        const templates = parseSettings(await ctx.settings.get());
        return {
          options: {
            dailyTemplate: templates.dailyTemplate,
            weeklyTemplate: templates.weeklyTemplate,
          },
        };
      },
    },

    /** 导出全部复盘条目为 JSON（含软删除）——宪法 §4 数据可导出 */
    exportData: {
      permission: 'journal:read',
      handler: async (ctx) => {
        const rows = await ctx.db
          .select()
          .from(entry)
          .where(eq(entry.workspaceId, ctx.workspaceId));
        return {
          exportedAt: new Date().toISOString(),
          moduleName: 'journal',
          count: rows.length,
          entries: rows,
        };
      },
    },

    /**
     * 导入：接受导出格式的 JSON，幂等合并（保留原 id，冲突跳过）——宪法 §4 备份恢复闭环。
     * workspaceId 强制当前工作空间；同 (kind, day) 已有活跃条目时不覆盖（冲突由
     * partial unique index 吸收、整行跳过）；deletedAt 非法时间戳的行也跳过。
     */
    importData: {
      permission: 'journal:write',
      handler: async (ctx, input) => {
        const parsed = z
          .object({
            entries: z.array(
              z.object({
                id: z.string().uuid().optional(),
                kind: z.enum(['daily', 'weekly']).optional(),
                day: dateStr,
                mood: z.number().int().min(1).max(5).nullable().optional(),
                content: z.string().max(20000).optional(),
                aiText: z.string().nullable().optional(),
                deletedAt: z.string().nullable().optional(),
              }),
            ),
          })
          .safeParse(input);
        if (!parsed.success) bad('导入数据格式不正确');
        const rows: Array<typeof entry.$inferInsert> = [];
        for (const item of parsed.data.entries) {
          let deletedAt: Date | null = null;
          if (typeof item.deletedAt === 'string') {
            const time = new Date(item.deletedAt).getTime();
            if (Number.isNaN(time)) continue; // 无效时间戳：跳过该行
            deletedAt = new Date(time);
          }
          rows.push({
            ...(item.id ? { id: item.id } : {}),
            workspaceId: ctx.workspaceId,
            kind: item.kind ?? 'daily',
            day: item.day,
            mood: item.mood ?? null,
            content: item.content ?? '',
            aiText: item.aiText ?? null,
            deletedAt,
          });
        }
        if (rows.length === 0) return { imported: 0, skipped: parsed.data.entries.length };
        const inserted = await ctx.db
          .insert(entry)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: entry.id });
        return { imported: inserted.length, skipped: parsed.data.entries.length - inserted.length };
      },
    },
    /** AI 润色（唯一 AI 消耗点）：显式触发、一次调用、结果入库存档；Mock 未配置时拒绝 */
    polishEntry: {
      permission: 'journal:write',
      handler: async (ctx, input) => {
        const parsed = idSchema.safeParse(input ?? {});
        if (!parsed.success) bad('条目 ID 不合法');
        const row = await ownedEntry(ctx, parsed.data.entryId);
        if (row.deletedAt) bad('归档条目不能润色');
        if (row.content.trim().length === 0) bad('先写点内容再润色');

        const polished = await ctx.ai
          .complete(
            [
              `这是我的${row.kind === 'weekly' ? '本周' : '今天'}复盘原文：`,
              row.content,
              '',
              '请在不添加不存在的事实、保持第一人称的前提下，把这段复盘整理得更通顺有条理（100 字以内）。只输出润色后的文本。',
            ].join('\n'),
            '你是 Atlas 个人成长助手：忠实、克制、温暖。只输出润色后的文本本身。',
          )
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            throw new ModuleActionError(`AI 润色失败：${message}`);
          });

        if (polished.startsWith('[MockAI]')) {
          throw new ModuleActionError('AI 供应商未配置（当前为本地预览），润色需要真实供应商');
        }

        await ctx.db
          .update(entry)
          .set({ aiText: polished, aiPolishedAt: new Date(), updatedAt: new Date() })
          .where(eq(entry.id, row.id));
        await ctx.events.publish('journal.polished', { entryId: row.id });
        return { aiText: polished };
      },
    },
  },
};

/** 供测试与快照使用的辅助导出（不属于模块协议表面） */
export { buildSnapshot, isMonday };
