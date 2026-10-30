import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { runMigrations } from './db/migrate';
import type { Db } from './db/client';
import type { ApiEnv } from './env';
import { startEmbeddedPostgres, type EmbeddedPostgresHandle } from './infra/embedded-postgres';
import { AppModule } from './app.module';
import { DB_TOKEN, ENV_TOKEN } from './tokens';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  const env = app.get<ApiEnv>(ENV_TOKEN);
  const db = app.get<Db>(DB_TOKEN);

  // 数据库先行（内嵌 PG 复用/启动），再执行迁移，最后开始监听
  const pgHandle: EmbeddedPostgresHandle = await startEmbeddedPostgres(env);

  app.enableCors({ origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) });
  app.setGlobalPrefix('v1');

  await runMigrations(db);
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
