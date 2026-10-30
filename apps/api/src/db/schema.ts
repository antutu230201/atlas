import { pgSchema, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * 表命名规约（写进 ADR-0001，阶段 2 内核实体沿用）：
 * - 内核自有表统一放 platform schema；
 * - 业务模块将来各自使用独立 schema（modules.<name>），互不越界；
 * - 全部业务表（阶段 2 起）必须带 workspace_id。
 *
 * 阶段 0 只建一张"链路验证表"：证明 迁移 → 连接 → 写入 读链路可用。
 * 真实内核实体（user / workspace / membership / event / audit_log 等）在阶段 2 落地。
 */
export const platform = pgSchema('platform');

/** 每次进程启动写入一行，用于验证数据库写链路与迁移执行情况 */
export const bootMarkers = platform.table('boot_markers', {
  id: serial('id').primaryKey(),
  bootedAt: timestamp('booted_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note').notNull().default(''),
});
