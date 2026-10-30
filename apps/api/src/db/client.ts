import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** 创建 Drizzle 客户端；pg Pool 懒连接，可在数据库就绪前安全创建 */
export function createDb(databaseUrl: string): Db {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  return drizzle(pool, { schema });
}
