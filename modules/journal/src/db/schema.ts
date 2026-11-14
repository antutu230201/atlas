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
import { sql } from 'drizzle-orm';

/** 复盘日记模块自有 schema */
export const moduleSchema = pgSchema('modules.journal');

/**
 * 复盘条目：daily（一天一篇，day=当天）/ weekly（一周一篇，day=周一）。
 * (workspace_id, kind, day) 部分唯一（deleted_at IS NULL）→ 保存即 upsert；
 * 删除走 deleted_at 软删除（可恢复）；AI 润色稿独立存 aiText，不覆盖用户原文。
 */
export const entry = moduleSchema.table(
  'entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    /** daily | weekly */
    kind: text('kind').notNull().default('daily'),
    /** 周期起始日：daily=当天，weekly=周一（YYYY-MM-DD） */
    day: date('day').notNull(),
    /** 心情 1–5（😞😕😐🙂😄），可空 */
    mood: integer('mood'),
    content: text('content').notNull().default(''),
    /** AI 润色稿（显式触发，一次一存；不覆盖原文） */
    aiText: text('ai_text'),
    aiPolishedAt: timestamp('ai_polished_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('entry_workspace_kind_day_uq')
      .on(t.workspaceId, t.kind, t.day)
      .where(sql`deleted_at IS NULL`),
    index('entry_workspace_idx').on(t.workspaceId, t.kind, t.day),
  ],
);
