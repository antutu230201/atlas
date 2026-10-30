import { index, inet, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { platform } from './platform';

/**
 * 身份域：user（全局）与 session。
 * email 写入时统一小写（应用层归一化），避免引入 citext 扩展（ADR-0005 §2）。
 */
export const user = platform.table(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status', { enum: ['active', 'blocked'] })
      .notNull()
      .default('active'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    settings: jsonb('settings').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('user_email_unique').on(t.email)],
);

export const session = platform.table(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    device: text('device').notNull().default(''),
    ip: inet('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('session_token_hash_unique').on(t.tokenHash),
    index('session_user_idx').on(t.userId),
  ],
);
