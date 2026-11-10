import {
  date,
  doublePrecision,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** 目标与年度计划模块自有 schema */
export const moduleSchema = pgSchema('modules.goals');

/**
 * 目标（Objective）：一个周期内的方向性追求，如「2026 健康升级」。
 * 删除走 archived_at 软删除（可恢复）；达成态不落库，由关键结果进度动态推导。
 */
export const objective = moduleSchema.table(
  'objective',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    /** 周期类型：year | quarter | month | custom（边界由 period + 起止日共同表达） */
    period: text('period').notNull().default('year'),
    /** 周期起止（本地时区 YYYY-MM-DD，与习惯模块 day 口径一致） */
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** 单 emoji 视觉标识 */
    icon: text('icon').notNull().default('🎯'),
    /** 排序权重：小在前；新建追加到末尾 */
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('objective_workspace_idx').on(t.workspaceId, t.archivedAt, t.sortOrder)],
);

/**
 * 关键结果（Key Result）：目标的可度量拆解。
 * - number 数值型：start → target，current 随手更新，进度 = (current-start)/(target-start)
 * - boolean 达成型：只有未达成/已完成两态（completed_at 非空即达成）
 * 删除走 deleted_at 软删除。
 */
export const keyResult = moduleSchema.table(
  'key_result',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    objectiveId: uuid('objective_id').notNull(),
    title: text('title').notNull(),
    /** number | boolean */
    type: text('type').notNull().default('number'),
    startValue: doublePrecision('start_value').notNull().default(0),
    targetValue: doublePrecision('target_value').notNull().default(1),
    currentValue: doublePrecision('current_value').notNull().default(0),
    /** 数值型单位（kg / 分钟 / 本 …），展示用 */
    unit: text('unit'),
    /** 达成型：完成时间；数值型：current 抵达 target 的时间 */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** 软删除：目标恢复不连带复活已删的关键结果 */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('key_result_objective_idx').on(t.objectiveId, t.deletedAt, t.sortOrder),
    index('key_result_workspace_idx').on(t.workspaceId),
  ],
);
