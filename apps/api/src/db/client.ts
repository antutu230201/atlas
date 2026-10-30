import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** 创建 Drizzle 客户端；pg Pool 懒连接，可在数据库就绪前安全创建 */
export function createDb(databaseUrl: string): Db {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  return drizzle(pool, { schema });
}

/** 带连接池句柄的变体：迁移/测试用完可显式释放 */
export function createManagedDb(databaseUrl: string): {
  db: Db;
  end: () => Promise<void>;
} {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  return { db: drizzle(pool, { schema }), end: () => pool.end() };
}
