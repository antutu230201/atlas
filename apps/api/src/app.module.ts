import { Module } from '@nestjs/common';
import type { HealthProbe } from '@atlas/core';
import { createDb, type Db } from './db/client';
import type { ApiEnv } from './env';
import { loadEnv } from './env';
import { buildProbes } from './infra/probes';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { API_VERSION, DB_TOKEN, ENV_TOKEN, PROBES_TOKEN } from './tokens';

/**
 * 阶段 0 的应用模块：只有健康检查一个功能。
 * 阶段 2 的内核（账号、工作空间、模块系统、事件总线……）从这里长出来，
 * 且必须以"新增模块"的方式生长，不改已有文件（AGENTS.md 架构铁律）。
 */
@Module({
  controllers: [HealthController],
  providers: [
    { provide: ENV_TOKEN, useFactory: loadEnv },
    {
      provide: DB_TOKEN,
      inject: [ENV_TOKEN],
      useFactory: (env: ApiEnv) => createDb(env.DATABASE_URL),
    },
    {
      provide: PROBES_TOKEN,
      inject: [ENV_TOKEN],
      useFactory: (env: ApiEnv) => buildProbes(env),
    },
    {
      provide: HealthService,
      inject: [DB_TOKEN, PROBES_TOKEN],
      useFactory: (db: Db, probes: HealthProbe[]) => new HealthService(db, probes, API_VERSION),
    },
  ],
})
export class AppModule {}
