import { pgSchema, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * platform schema：内核自有表统一放这里；业务模块将来各自建 `modules.<name>` schema。
 * 阶段 0 的链路验证表保留；真实内核实体自阶段 2（ADR-0005）落地。
 */
export const platform = pgSchema('platform');

/** 阶段 0 的链路验证表：每次进程启动写入一行 */
export const bootMarkers = platform.table('boot_markers', {
  id: serial('id').primaryKey(),
  bootedAt: timestamp('booted_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note').notNull().default(''),
});
