import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { createManagedDb } from './db/client';
import type { ApiEnv } from './env';
import { startEmbeddedPostgres, type EmbeddedPostgresHandle } from './infra/embedded-postgres';
import { AppModule } from './app.module';
import { ENV_TOKEN } from './tokens';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  const env = app.get<ApiEnv>(ENV_TOKEN);

  // 数据库先行：内嵌 PG 启动/复用 → 以管理员连接跑迁移 → 运行时连接（atlas_app，受 RLS 约束）才开始服务
  const pgHandle: EmbeddedPostgresHandle = await startEmbeddedPostgres(env);
  const admin = createManagedDb(env.DATABASE_URL_ADMIN);
  await migrate(admin.db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  await admin.end();

  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('v1');

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
  console.error('[api] 启动失败：', error);
  process.exit(1);
});
