import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import type { Db } from './client';

/**
 * 执行 apps/api/drizzle 下的迁移（drizzle-kit 生成，全部走迁移文件，禁止手改库）。
 * 目录以进程工作目录解析 —— API 总是以 apps/api 为 cwd 启动（pnpm --filter / turbo）。
 */
export async function runMigrations(db: Db): Promise<void> {
  const migrationsFolder = resolve(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });
}
