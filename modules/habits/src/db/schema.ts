import {
  date,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** 习惯打卡模块自有 schema */
export const moduleSchema = pgSchema('modules.habits');

/** 习惯：工作区内的每日打卡项；删除走 archived_at 软删除（可恢复） */
export const habit = moduleSchema.table(
  'habit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    name: text('name').notNull(),
    /** 单字符 emoji，列表与打卡按钮展示用 */
    icon: text('icon').notNull().default('✅'),
    /** 排序权重：小在前；新建追加到末尾 */
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('habit_workspace_idx').on(t.workspaceId, t.archivedAt, t.sortOrder)],
);

/** 打卡记录：一天一条（habit+day 唯一）；取消打卡即删行，历史天数不回填 */
export const habitLog = moduleSchema.table(
  'habit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    habitId: uuid('habit_id').notNull(),
    /** 打卡日（本地时区 YYYY-MM-DD，与 dashboard.activity 的 day 口径一致） */
    day: date('day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('habit_log_habit_day_uq').on(t.habitId, t.day),
    index('habit_log_workspace_idx').on(t.workspaceId, t.day),
  ],
);
