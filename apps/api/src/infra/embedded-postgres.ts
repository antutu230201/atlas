import { createConnection } from 'node:net';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { ApiEnv } from '../env';

export interface EmbeddedPostgresHandle {
  stop(): Promise<void>;
}

const IDLE_HANDLE: EmbeddedPostgresHandle = { stop: async () => undefined };

export function isPortOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
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
 * 真实可用性探测：TCP 通不代表 PG 能服务——孤儿实例可能正处于关闭流程，
 * SQL 会被拒绝。用 SELECT 1（2s 超时）判断"这个端口上的 PG 现在能不能干活"。
 */
async function pgResponds(
  host: string,
  port: number,
  user: string,
  password: string,
  database: string,
  timeoutMs = 2_000,
): Promise<boolean> {
  const client = new Client({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
  });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * 清理半死的内嵌实例：读数据目录 postmaster.pid 拿到 PG 主进程 PID（Windows 上即
 * 进程 PID）并终止它，再等端口释放。孤儿 postgres.exe 会锁住数据目录，不清理则
 * 后续启动全部失败——这正是热重载后 API"假死"需要手动杀进程的根因。
 */
async function killStalePostgres(dataDir: string, host: string, port: number): Promise<void> {
  try {
    const pidFile = await readFile(resolve(dataDir, 'postmaster.pid'), 'utf8');
    const pid = Number(pidFile.split('\n')[0]?.trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid);
        console.log(`[infra] 已终止孤儿 PostgreSQL 进程（PID ${pid}）`);
      } catch {
        // 进程已不在：继续走端口等待
      }
    }
  } catch {
    // 没有 pid 文件：端口可能被外部实例占用，不动它
    return;
  }
  for (let waited = 0; waited < 5_000; waited += 250) {
    if (!(await isPortOpen(host, port, 300))) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.warn('[infra] 端口在 5s 内未释放，继续尝试启动（可能失败）');
}

/**
 * 开发期数据库生命周期（ADR-0002，免 Docker 本地栈）：
 * 1. EMBEDDED_PG=false → 什么都不做（连接外部 PostgreSQL，如 docker-compose）；
 * 2. 目标端口已有实例在监听 → 直接复用（上次遗留的实例 / 手动启动的 PG）；
 * 3. 否则用 embedded-postgres 拉起本地 PostgreSQL 18，
 *    数据目录 apps/api/.local/pgdata（gitignore，可随时删除重建）。
 * 内嵌实例以管理员身份（DATABASE_URL_ADMIN）启动与建库；应用运行时另用受 RLS
 * 约束的 atlas_app 角色（DATABASE_URL，见 ADR-0005 §4）。
 */
export async function startEmbeddedPostgres(env: ApiEnv): Promise<EmbeddedPostgresHandle> {
  if (!env.EMBEDDED_PG) {
    return IDLE_HANDLE;
  }

  const url = new URL(env.DATABASE_URL_ADMIN);
  const host = url.hostname || 'localhost';
  const port = Number(url.port || 5432);
  const user = url.username || 'atlas';
  const password = url.password || 'atlas';
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'atlas';
  // 以 apps/api（进程工作目录）为锚，避免 dist 输出层级变化导致路径漂移
  const dataDir = resolve(process.cwd(), env.PG_DATA_DIR);

  if (await isPortOpen(host, port)) {
    // TCP 通 != 能服务：孤儿实例可能正在关闭。探测失败则按 postmaster.pid 清理后自启
    if (await pgResponds(host, port, user, password, database)) {
      console.log(`[infra] ${host}:${port} 已有健康的 PostgreSQL 实例在运行，直接复用`);
      return IDLE_HANDLE;
    }
    console.warn(`[infra] ${host}:${port} 上的 PostgreSQL 无响应，尝试清理孤儿实例…`);
    await killStalePostgres(dataDir, host, port);
  }

  // embedded-postgres 是 ESM 包，从 CommonJS 侧动态加载
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
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

  // 数据目录可能被孤儿实例锁住：先清理再启动，仍失败则重试一轮
  const startOnce = async (): Promise<void> => {
    try {
      await pg.initialise();
      console.log(`[infra] 已初始化 PostgreSQL 数据目录：${dataDir}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/exists/i.test(message)) {
        console.error(`[infra] initdb 失败：${message.slice(0, 200)}`);
        throw error;
      }
      console.log('[infra] 数据目录已存在，跳过 initdb');
    }
    await pg.start();
  };
  try {
    await startOnce();
  } catch {
    console.warn('[infra] 启动失败，尝试清理孤儿实例后重试一次…');
    await killStalePostgres(dataDir, host, port);
    await startOnce();
  }
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
