import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import type { ApiEnv } from '../env';

export interface EmbeddedPostgresHandle {
  stop(): Promise<void>;
}

const IDLE_HANDLE: EmbeddedPostgresHandle = { stop: async () => undefined };

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
 * 开发期数据库生命周期（ADR-0002，免 Docker 本地栈）：
 * 1. EMBEDDED_PG=false → 什么都不做（连接外部 PostgreSQL，如 docker-compose）；
 * 2. 目标端口已有实例在监听 → 直接复用（上次遗留的实例 / 手动启动的 PG）；
 * 3. 否则用 embedded-postgres 拉起本地 PostgreSQL 18，
 *    数据目录 apps/api/.local/pgdata（gitignore，可随时删除重建）。
 */
export async function startEmbeddedPostgres(env: ApiEnv): Promise<EmbeddedPostgresHandle> {
  if (!env.EMBEDDED_PG) {
    return IDLE_HANDLE;
  }

  const url = new URL(env.DATABASE_URL);
  const host = url.hostname || 'localhost';
  const port = Number(url.port || 5432);
  const user = url.username || 'atlas';
  const password = url.password || 'atlas';
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'atlas';

  if (await isPortOpen(host, port)) {
    console.log(`[infra] ${host}:${port} 已有 PostgreSQL 实例在运行，直接复用`);
    return IDLE_HANDLE;
  }

  // embedded-postgres 是 ESM 包，从 CommonJS 侧动态加载
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  // 以 apps/api（进程工作目录）为锚，避免 dist 输出层级变化导致路径漂移
  const dataDir = resolve(process.cwd(), env.PG_DATA_DIR);
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
    // 中文 Windows 上该二进制在 post-bootstrap 会写入 GBK 字节的系统串，
    // UTF8 编码校验会拒绝（0xb8 FATAL）。开发库改用 C locale + SQL_ASCII
    // （字节透传，客户端以 UTF8 存取不受影响）；详见 ADR-0002。
    initdbFlags: ['--locale=C', '--encoding=SQL_ASCII'],
  });

  try {
    await pg.initialise();
    console.log(`[infra] 已初始化 PostgreSQL 数据目录：${dataDir}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/exists/i.test(message)) {
      console.log('[infra] 数据目录已存在，跳过 initdb');
    } else {
      console.error(`[infra] initdb 失败：${message}`);
      throw error;
    }
  }
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[infra] 数据库 ${database} 已存在（${message.slice(0, 120)}）`);
  }
  console.log(`[infra] PostgreSQL 已启动：${host}:${port}/${database}`);

  return {
    stop: async () => {
      console.log('[infra] 正在停止 PostgreSQL…');
      await pg.stop();
    },
  };
}
