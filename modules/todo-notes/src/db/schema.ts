import { index, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** 待办与笔记模块自有 schema */
export const moduleSchema = pgSchema('modules.todo_notes');

/**
 * 待办：软删除（deletedAt）→ 回收站；sortOrder 支持拖拽排序；completedAt 记完成时点。
 * 归属与隔离：workspace_id + RLS（见 migrations/0001_rls.sql）。
 */
export const todo = moduleSchema.table(
  'todo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    status: text('status', { enum: ['open', 'doing', 'done'] })
      .notNull()
      .default('open'),
    priority: text('priority', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .default('normal'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('todo_workspace_status_idx').on(t.workspaceId, t.status),
    index('todo_workspace_sort_idx').on(t.workspaceId, t.sortOrder),
  ],
);
