import { index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './identity';
import { platform } from './platform';

/** 工作空间（租户）：数据隔离边界；slug 为路由用唯一短名 */
export const workspace = platform.table(
  'workspace',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: text('plan', { enum: ['free', 'pro', 'team', 'enterprise'] })
      .notNull()
      .default('free'),
    settings: jsonb('settings').notNull().default({}),
    brand: jsonb('brand').notNull().default({}),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('workspace_slug_unique').on(t.slug)],
);

/** 成员关系：用户在某工作空间中的角色 */
export const membership = platform.table(
  'membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member', 'guest'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('membership_workspace_user_unique').on(t.workspaceId, t.userId),
    index('membership_user_idx').on(t.userId),
  ],
);

/** 成员邀请：token 明文只出现在邀请链接里，库存 sha256 */
export const invitation = platform.table(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role', { enum: ['admin', 'member', 'guest'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invitation_token_hash_unique').on(t.tokenHash),
    index('invitation_workspace_email_idx').on(t.workspaceId, t.email),
  ],
);
