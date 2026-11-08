import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { createManagedDb } from './db/client';
import type { ApiEnv } from './env';
import {
  isPortOpen,
  startEmbeddedPostgres,
  type EmbeddedPostgresHandle,
} from './infra/embedded-postgres';
import { AppModule } from './app.module';
import { ENV_TOKEN } from './tokens';

async function bootstrap(): Promise<void> {
  // 分阶段日志：热重载偶发卡死时，最后一条日志能直接定位卡点
  console.log('[api] 阶段 1/4：启动 Nest 容器');
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  const env = app.get<ApiEnv>(ENV_TOKEN);

  // 端口预检：tsx watch 在 Windows 上无法可靠终止旧进程树，热重载后旧实例常残留——
  // 与其让 listen 抛 EADDRINUSE 再猜，不如启动前就给出明确指引
  if (await isPortOpen('localhost', env.PORT, 500)) {
    console.error(
      `[api] 端口 ${env.PORT} 已被监听：上一个 dev 实例还没退出。`,
      '\n[api] 处理：taskkill /IM node.exe /F 后重启 pnpm dev（会一并清理内嵌 PG）。',
    );
    process.exit(1);
  }

  // 数据库先行：内嵌 PG 启动/复用 → 以管理员连接跑迁移 → 运行时连接（atlas_app，受 RLS 约束）才开始服务
  console.log('[api] 阶段 2/4：准备数据库（内嵌 PG 启动或复用）');
  const pgHandle: EmbeddedPostgresHandle = await startEmbeddedPostgres(env);
  const admin = createManagedDb(env.DATABASE_URL_ADMIN, { connectionTimeoutMillis: 5_000 });
  console.log('[api] 阶段 3/4：执行内核迁移');
  // 迁移卡住 = PG 被半死的旧实例持锁：30s 强制失败并给出指引，比无限挂起好排查
  await Promise.race([
    migrate(admin.db, { migrationsFolder: resolve(process.cwd(), 'drizzle') }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('内核迁移超过 30s 未完成')), 30_000),
    ),
  ]).finally(() => {
    void admin.end();
  });

  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('v1');

  console.log(`[api] 阶段 4/4：监听端口 ${env.PORT}`);
  await app.listen(env.PORT);
  console.log(`[api] Atlas API 就绪：http://localhost:${env.PORT}/v1/health`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] 收到 ${signal}，正在关闭…`);
    try {
      await app.close();
      await pgHandle.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  if (/EADDRINUSE/i.test(message)) {
    console.error(
      '[api] 端口被占用：上一个 dev 实例可能还没完全退出（tsx watch 在 Windows 上无法可靠终止进程树）。',
      '\n[api] 处理：关闭旧进程后重启。彻底清理：taskkill /IM node.exe /F，再删除 apps/api/.local/pgdata/postmaster.pid。',
    );
  }
  console.error('[api] 启动失败：', message.slice(0, 600));
  process.exit(1);
});
