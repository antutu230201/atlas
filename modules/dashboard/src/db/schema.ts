import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** 个人大屏模块自有 schema */
export const moduleSchema = pgSchema('modules.dashboard');

/**
 * 数据源缓存：服务端直连外部 API 的落库快照（重启不丢、过期可回退展示旧值）。
 * sourceKey 形如 hot:weibo / weather:<lat>,<lon> / quote / wallpaper；payload 为归一化结果。
 */
export const sourceCache = moduleSchema.table(
  'source_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    sourceKey: text('source_key').notNull(),
    payload: jsonb('payload').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('source_cache_ws_key_uq').on(t.workspaceId, t.sourceKey),
    index('source_cache_ws_idx').on(t.workspaceId),
  ],
);

/**
 * 倒计时 / 纪念日：targetDate 用 date 类型（无时区歧义，按本地日期计算天数差）。
 * 软删除（deletedAt）→ 大屏设置抽屉内可恢复。
 */
export const countdown = moduleSchema.table(
  'countdown',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    title: text('title').notNull(),
    targetDate: date('target_date').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('countdown_ws_active_idx').on(t.workspaceId, t.deletedAt, t.pinned)],
);

/**
 * 每日活跃度：经事件总线订阅 todo.completed 等成长事件累积（模块间不直读对方表，ADR-0005 §8）。
 * day 为工作空间本地日期（date 类型，无时区歧义）；count 当日完成次数；一天一行 upsert 累加。
 */
export const activity = moduleSchema.table(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('activity_ws_day_uq').on(t.workspaceId, t.day),
    index('activity_ws_day_idx').on(t.workspaceId, t.day),
  ],
);

/**
 * 网易云账号绑定：每 (工作空间, 用户) 一条；cookie_sealed 为 AES-256-GCM 密文
 * （密钥在环境变量 ATLAS_NETEASE_SECRET，providers/secret-box.ts），明文不落库不落日志。
 * 解绑为软删除；部分唯一索引保证活跃绑定唯一，解绑后可重新扫码。
 */
export const neteaseBinding = moduleSchema.table(
  'netease_binding',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id').notNull(),
    neteaseUid: bigint('netease_uid', { mode: 'number' }).notNull(),
    neteaseNickname: text('netease_nickname').notNull(),
    cookieSealed: text('cookie_sealed').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('netease_binding_ws_user_uq')
      .on(t.workspaceId, t.userId)
      .where(sql`deleted_at is null`),
    index('netease_binding_ws_idx').on(t.workspaceId),
  ],
);

/**
 * 听歌时长（按 天 × 用户 × 歌曲 聚合）：播放器心跳上报累加（telemetry，非审计对象）。
 * userName 为快照（免跨 schema 联用户表，排名展示用）；date 无时区歧义。
 */
export const listeningDaily = moduleSchema.table(
  'listening_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id').notNull(),
    userName: text('user_name').notNull(),
    day: date('day').notNull(),
    songId: bigint('song_id', { mode: 'number' }).notNull(),
    songTitle: text('song_title').notNull(),
    songArtist: text('song_artist').notNull(),
    seconds: integer('seconds').notNull().default(0),
    plays: integer('plays').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('listening_daily_uq').on(t.workspaceId, t.userId, t.day, t.songId),
    index('listening_daily_ws_day_idx').on(t.workspaceId, t.day),
    index('listening_daily_ws_user_idx').on(t.workspaceId, t.userId, t.day),
  ],
);
