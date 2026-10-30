import { bigserial, index, inet, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './identity';
import { platform } from './platform';
import { workspace } from './workspace';

/**
 * 审计日志（只追加）：谁、何时、对什么、改了什么。
 * workspace/actor 可空 —— 系统级操作（如启动任务）无租户归属。
 */
export const auditLog = platform.table(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id').references(() => workspace.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorType: text('actor_type', { enum: ['user', 'system', 'module'] })
      .notNull()
      .default('user'),
    action: text('action').notNull(),
    objectType: text('object_type').notNull(),
    objectId: text('object_id').notNull().default(''),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_workspace_created_idx').on(t.workspaceId, t.createdAt)],
);

/** 站内通知（邮件适配器阶段 2c 接入，本地开发打印到日志） */
export const notification = platform.table(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: jsonb('body').notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notification_user_created_idx').on(t.userId, t.createdAt)],
);
