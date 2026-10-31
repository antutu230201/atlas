import { index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { platform } from './platform';
import { user } from './identity';
import { workspace } from './workspace';

/**
 * 事件 outbox（ADR-0005 §8）：业务数据与事件同事务写入，派发器异步投递。
 * 投递语义 at-least-once；status: pending → processing → delivered / dead。
 * actor_user_id：触发者（派发时作为 RLS 投递上下文）；claimed_at：僵死回收依据。
 */
export const event = platform.table(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    payload: jsonb('payload').notNull(),
    workspaceId: uuid('workspace_id').references(() => workspace.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['pending', 'processing', 'delivered', 'dead'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(8),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    lastError: text('last_error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('event_dispatch_idx').on(t.status, t.nextAttemptAt),
    index('event_workspace_idx').on(t.workspaceId, t.createdAt),
  ],
);

/** 模块注册的事件订阅（启用模块时写入；handler 由模块实现） */
export const eventSubscription = platform.table(
  'event_subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleName: text('module_name').notNull(),
    eventName: text('event_name').notNull(),
    handlerKey: text('handler_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('event_subscription_unique').on(t.moduleName, t.eventName, t.handlerKey),
    index('event_subscription_event_idx').on(t.eventName),
  ],
);
