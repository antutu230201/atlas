import { index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * 示例模块自有 schema：modules.<name>（ADR-0005 §2）。
 * 归属约束由 RLS + 应用层保证；跨 schema 外键待内核导出共享 schema 包后补充（2c+）。
 */
export const moduleSchema = pgSchema('modules.sample_note');

export const note = moduleSchema.table(
  'note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('note_workspace_created_idx').on(t.workspaceId, t.createdAt)],
);
