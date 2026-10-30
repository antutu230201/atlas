import path from 'node:path';
import { createConnection } from 'node:net';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createManagedDb } from '../../src/db/client';

const PORT = 5433;
const ADMIN_URL = `postgres://atlas:atlas@localhost:${PORT}/atlas`;
const DATA_DIR = path.resolve(process.cwd(), '.local/pgdata-test');

declare global {
  var __atlasTestPg: { stop: () => Promise<void> } | undefined;
}

function isPortOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port });
    const finish = (open: boolean) => {
      socket.destroy();
      resolvePromise(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * 集成测试全局装置：在内嵌 PostgreSQL（5433，独立数据目录 .local/pgdata-test）
 * 上执行全部迁移，供真实数据库集成测试使用。上一次运行遗留的实例会被复用。
 */
export default async function (): Promise<() => Promise<void>> {
  if (!(await isPortOpen('localhost', PORT))) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const pg = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: 'atlas',
      password: 'atlas',
      port: PORT,
      persistent: true,
      // 与 ADR-0002 相同：中文 Windows 下 C locale + SQL_ASCII
      initdbFlags: ['--locale=C', '--encoding=SQL_ASCII'],
    });
    try {
      await pg.initialise();
    } catch {
      // 数据目录已存在
    }
    await pg.start();
    try {
      await pg.createDatabase('atlas');
    } catch {
      // 数据库已存在
    }
    globalThis.__atlasTestPg = pg;
  }

  const admin = createManagedDb(ADMIN_URL);
  await migrate(admin.db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
  // 测试库跨运行持久化：迁移后清空业务数据，保证测试幂等（结构保留）
  await admin.db.execute(sql`
    truncate table
      platform.notification, platform.audit_log, platform.event_subscription,
      platform.event, platform.entitlement, platform.module_install,
      platform.invitation, platform.membership, platform.session,
      platform.workspace, platform."user", platform.boot_markers
    restart identity cascade
  `);
  await admin.end();

  return async () => {
    await globalThis.__atlasTestPg?.stop();
    globalThis.__atlasTestPg = undefined;
  };
}
