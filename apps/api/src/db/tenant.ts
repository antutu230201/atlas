import { sql } from 'drizzle-orm';
import type { Db } from './client';

/**
 * 租户上下文事务（ADR-0005 §4）：
 * 在事务内设置 app.user_id（事务级，连接归还时自动清除），
 * RLS 策略据此过滤所有 workspace 归属数据。所有业务查询都必须经此包装。
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx as unknown as Db);
  });
}
