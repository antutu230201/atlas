import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import type { HealthProbe } from '@atlas/core';
import { provideAuditInterceptor, AuditService } from './audit/audit.service';
import { AIController } from './ai/ai.controller';
import { EventDispatcherService } from './events/event-dispatcher.service';
import { EventOutboxService } from './events/event-outbox.service';
import { NotificationController } from './events/notification.controller';
import { NotificationService } from './events/notification.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { RateLimitService } from './auth/rate-limit.service';
import { SessionService } from './auth/session.service';
import { createDb, type Db } from './db/client';
import type { ApiEnv } from './env';
import { loadEnv } from './env';
import { buildProbes } from './infra/probes';
import { WeeklyReportScheduler } from './infra/weekly-report.scheduler';
import { ModuleController } from './modules/kernel/module.controller';
import { ModuleRegistryService } from './modules/kernel/module-registry';
import { ModuleService } from './modules/kernel/module.service';
import { EntitlementService } from './modules/kernel/entitlement.service';
import { SecurityHeadersMiddleware } from './auth/security-headers.middleware';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { ConsoleMailAdapter } from '@atlas/core';
import type { AIAdapter } from '@atlas/core';
import { ConfigurableAIProvider, readAiConfigFromDb } from './ai/ai-config.service';
import { WorkspaceController } from './workspace/workspace.controller';
import { WorkspaceService } from './workspace/workspace.service';
import {
  API_VERSION,
  ADMIN_DB_TOKEN,
  AI_ADAPTER_TOKEN,
  AUDIT_SERVICE_TOKEN,
  AUTH_SERVICE_TOKEN,
  DB_TOKEN,
  ENV_TOKEN,
  EVENT_OUTBOX_SERVICE_TOKEN,
  HEALTH_SERVICE_TOKEN,
  MAIL_ADAPTER_TOKEN,
  NOTIFICATION_SERVICE_TOKEN,
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
  controllers: [
    HealthController,
    AuthController,
    WorkspaceController,
    ModuleController,
    NotificationController,
    AIController,
  ],
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
      useFactory: (
        db: Db,
        audit: AuditService,
        outbox: EventOutboxService,
        sessions: SessionService,
      ) => new WorkspaceService(db, audit, outbox, sessions),
      inject: [DB_TOKEN, AUDIT_SERVICE_TOKEN, EVENT_OUTBOX_SERVICE_TOKEN, SESSION_SERVICE_TOKEN],
    },
    {
      provide: EventOutboxService,
      useFactory: (db: Db, env: ApiEnv) => new EventOutboxService(db, env),
      inject: [DB_TOKEN, ENV_TOKEN],
    },
    { provide: EVENT_OUTBOX_SERVICE_TOKEN, useExisting: EventOutboxService },
    { provide: ConsoleMailAdapter, useFactory: () => new ConsoleMailAdapter() },
    { provide: MAIL_ADAPTER_TOKEN, useExisting: ConsoleMailAdapter },
    {
      // 阶段 5：启动时读库初始化（界面配置 > env > Mock），保存配置后经 refresh() 热切换
      provide: AI_ADAPTER_TOKEN,
      useFactory: async (db: Db, env: ApiEnv): Promise<AIAdapter> => {
        let initial: Awaited<ReturnType<typeof readAiConfigFromDb>> = null;
        try {
          initial = await readAiConfigFromDb(db);
        } catch {
          // 库尚未就绪（如首启迁移前）时先按 env/Mock 运行，配置页保存后即恢复
        }
        return new ConfigurableAIProvider(db, env, initial);
      },
      inject: [DB_TOKEN, ENV_TOKEN],
    },
    {
      provide: NotificationService,
      useFactory: (db: Db, mail: ConsoleMailAdapter) => new NotificationService(db, mail),
      inject: [DB_TOKEN, ConsoleMailAdapter],
    },
    { provide: NOTIFICATION_SERVICE_TOKEN, useExisting: NotificationService },
    {
      provide: EventDispatcherService,
      useFactory: (
        db: Db,
        adminDb: Db,
        env: ApiEnv,
        registry: ModuleRegistryService,
        moduleService: ModuleService,
        notifications: NotificationService,
        mail: ConsoleMailAdapter,
      ) =>
        new EventDispatcherService(db, adminDb, env, registry, moduleService, notifications, mail),
      inject: [
        DB_TOKEN,
        ADMIN_DB_TOKEN,
        ENV_TOKEN,
        MODULE_REGISTRY_SERVICE_TOKEN,
        MODULE_SERVICE_TOKEN,
        NOTIFICATION_SERVICE_TOKEN,
        ConsoleMailAdapter,
      ],
    },
    { provide: ModuleRegistryService, useFactory: () => new ModuleRegistryService() },
    {
      provide: EntitlementService,
      useFactory: (db: Db) => new EntitlementService(db),
      inject: [DB_TOKEN],
    },
    {
      provide: ModuleService,
      useFactory: (
        db: Db,
        adminDb: Db,
        audit: AuditService,
        outbox: EventOutboxService,
        registry: ModuleRegistryService,
        ai: AIAdapter,
      ) => new ModuleService(db, adminDb, audit, outbox, registry, ai),
      inject: [
        DB_TOKEN,
        ADMIN_DB_TOKEN,
        AUDIT_SERVICE_TOKEN,
        EVENT_OUTBOX_SERVICE_TOKEN,
        MODULE_REGISTRY_SERVICE_TOKEN,
        AI_ADAPTER_TOKEN,
      ],
    },
    WeeklyReportScheduler,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
