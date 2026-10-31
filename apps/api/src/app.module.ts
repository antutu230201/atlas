import { Module } from '@nestjs/common';
import type { HealthProbe } from '@atlas/core';
import { provideAuditInterceptor, AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { RateLimitService } from './auth/rate-limit.service';
import { SessionService } from './auth/session.service';
import { createDb, type Db } from './db/client';
import type { ApiEnv } from './env';
import { loadEnv } from './env';
import { buildProbes } from './infra/probes';
import { ModuleController } from './modules/kernel/module.controller';
import { ModuleRegistryService } from './modules/kernel/module-registry';
import { ModuleService } from './modules/kernel/module.service';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { WorkspaceController } from './workspace/workspace.controller';
import { WorkspaceService } from './workspace/workspace.service';
import {
  API_VERSION,
  ADMIN_DB_TOKEN,
  AUDIT_SERVICE_TOKEN,
  AUTH_SERVICE_TOKEN,
  DB_TOKEN,
  ENV_TOKEN,
  HEALTH_SERVICE_TOKEN,
  MODULE_REGISTRY_SERVICE_TOKEN,
  MODULE_SERVICE_TOKEN,
  PROBES_TOKEN,
  RATE_LIMIT_SERVICE_TOKEN,
  SESSION_SERVICE_TOKEN,
  WORKSPACE_SERVICE_TOKEN,
} from './tokens';

/**
 * 阶段 2a 内核应用模块（ADR-0005）：
 * 健康检查 + 认证 + 工作空间/成员 + 审计。
 * 所有依赖注入使用显式 @Inject(token)（esbuild 兼容约定，见 tokens.ts）。
 */
@Module({
  controllers: [HealthController, AuthController, WorkspaceController, ModuleController],
  providers: [
    { provide: ENV_TOKEN, useFactory: loadEnv },
    {
      provide: DB_TOKEN,
      inject: [ENV_TOKEN],
      useFactory: (env: ApiEnv) => createDb(env.DATABASE_URL),
    },
    {
      provide: ADMIN_DB_TOKEN,
      inject: [ENV_TOKEN],
      useFactory: (env: ApiEnv) => createDb(env.DATABASE_URL_ADMIN),
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
    { provide: SessionService, useFactory: (db: Db) => new SessionService(db), inject: [DB_TOKEN] },
    { provide: RateLimitService, useFactory: () => new RateLimitService() },
    {
      provide: AuditService,
      useFactory: (db: Db) => new AuditService(db),
      inject: [DB_TOKEN],
    },
    {
      provide: AuthService,
      useFactory: (db: Db, adminDb: Db, sessions: SessionService) =>
        new AuthService(db, adminDb, sessions),
      inject: [DB_TOKEN, ADMIN_DB_TOKEN, SESSION_SERVICE_TOKEN],
    },
    {
      provide: WorkspaceService,
      useFactory: (db: Db, audit: AuditService, sessions: SessionService) =>
        new WorkspaceService(db, audit, sessions),
      inject: [DB_TOKEN, AUDIT_SERVICE_TOKEN, SESSION_SERVICE_TOKEN],
    },
    { provide: ModuleRegistryService, useFactory: () => new ModuleRegistryService() },
    {
      provide: ModuleService,
      useFactory: (db: Db, adminDb: Db, audit: AuditService, registry: ModuleRegistryService) =>
        new ModuleService(db, adminDb, audit, registry),
      inject: [DB_TOKEN, ADMIN_DB_TOKEN, AUDIT_SERVICE_TOKEN, MODULE_REGISTRY_SERVICE_TOKEN],
    },
    { provide: MODULE_REGISTRY_SERVICE_TOKEN, useExisting: ModuleRegistryService },
    { provide: MODULE_SERVICE_TOKEN, useExisting: ModuleService },
    { provide: SESSION_SERVICE_TOKEN, useExisting: SessionService },
    { provide: RATE_LIMIT_SERVICE_TOKEN, useExisting: RateLimitService },
    { provide: AUTH_SERVICE_TOKEN, useExisting: AuthService },
    { provide: AUDIT_SERVICE_TOKEN, useExisting: AuditService },
    { provide: WORKSPACE_SERVICE_TOKEN, useExisting: WorkspaceService },
    { provide: HEALTH_SERVICE_TOKEN, useExisting: HealthService },
    provideAuditInterceptor(),
  ],
})
export class AppModule {}
