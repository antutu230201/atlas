import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { canModule, type Role } from '@atlas/core';
import type { AIAdapter } from '@atlas/core';
import type { ModuleContext, ModuleExecutor, ModuleManifest } from '@atlas/sdk';
import { event, eventSubscription, moduleInstall, aiUsage } from '../../db/schema';
import type { Db } from '../../db/client';
import { withUser } from '../../db/tenant';
import type { AuditService } from '../../audit/audit.service';
import type { EventOutboxService } from '../../events/event-outbox.service';
import {
  ADMIN_DB_TOKEN,
  AI_ADAPTER_TOKEN,
  AUDIT_SERVICE_TOKEN,
  DB_TOKEN,
  EVENT_OUTBOX_SERVICE_TOKEN,
  MODULE_REGISTRY_SERVICE_TOKEN,
} from '../../tokens';
import type { LoadedModule, ModuleRegistryService } from './module-registry';

export interface ModuleStatusView {
  name: string;
  version: string;
  title: string;
  description: string;
  enabled: boolean;
  installed: boolean;
  permissions: string[];
  routes: ModuleManifest['routes'];
  widgets: ModuleManifest['widgets'];
}

export interface ModuleCallContextParams {
  tx: Db;
  userId: string;
  workspaceId: string;
  role: Role;
}

/** 模块系统（ADR-0005 §7）：目录 / 启停 / 依赖解析 / 调用分发 */
@Injectable()
export class ModuleService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(ADMIN_DB_TOKEN) private readonly adminDb: Db,
    @Inject(AUDIT_SERVICE_TOKEN) private readonly audit: AuditService,
    @Inject(EVENT_OUTBOX_SERVICE_TOKEN) private readonly outbox: EventOutboxService,
    @Inject(MODULE_REGISTRY_SERVICE_TOKEN) private readonly registry: ModuleRegistryService,
    @Inject(AI_ADAPTER_TOKEN) private readonly ai: AIAdapter,
  ) {}

  /** 内核级目录：全部可发现模块（与工作空间无关） */
  async catalog(): Promise<
    Array<{ name: string; version: string; title: string; description: string }>
  > {
    return (await this.registry.all()).map((m) => ({
      name: m.definition.manifest.name,
      version: m.definition.manifest.version,
      title: m.definition.manifest.title,
      description: m.definition.manifest.description,
    }));
  }

  /** 工作空间视角：可用模块 + 安装/启用状态 */
  async listForWorkspace(workspaceId: string, userId: string): Promise<ModuleStatusView[]> {
    const modules = await this.registry.all();
    const installed = await withUser(this.db, userId, (tx) =>
      tx.select().from(moduleInstall).where(eq(moduleInstall.workspaceId, workspaceId)),
    );
    const byName = new Map(installed.map((row) => [row.moduleName, row]));
    return modules.map((m) => {
      const row = byName.get(m.definition.manifest.name);
      return {
        name: m.definition.manifest.name,
        version: m.definition.manifest.version,
        title: m.definition.manifest.title,
        description: m.definition.manifest.description,
        enabled: row?.status === 'enabled',
        installed: row !== undefined,
        permissions: m.definition.manifest.permissions,
        routes: m.definition.manifest.routes,
        widgets: m.definition.manifest.widgets ?? [],
      };
    });
  }

  async getInstall(workspaceId: string, userId: string, name: string) {
    const rows = await withUser(this.db, userId, (tx) =>
      tx
        .select()
        .from(moduleInstall)
        .where(and(eq(moduleInstall.workspaceId, workspaceId), eq(moduleInstall.moduleName, name)))
        .limit(1),
    );
    return rows[0] ?? null;
  }

  /** 启用（含依赖按序自动启用 + 模块迁移执行）。幂等：已启用直接返回启用顺序 */
  async enable(workspaceId: string, userId: string, name: string): Promise<string[]> {
    const target = await this.registry.get(name);
    if (!target) {
      throw new NotFoundException({
        error: 'atlas.module.unknown',
        message: `模块 ${name} 不存在`,
      });
    }
    const enabledOrder: string[] = [];
    const visiting = new Set<string>();

    const enableDeep = async (moduleName: string): Promise<void> => {
      if (enabledOrder.includes(moduleName)) return;
      if (visiting.has(moduleName)) {
        throw new ConflictException({
          error: 'atlas.module.dependency-cycle',
          message: `模块依赖存在环：${[...visiting, moduleName].join(' → ')}`,
        });
      }
      visiting.add(moduleName);
      const mod = (await this.registry.get(moduleName)) as LoadedModule;
      for (const dep of mod.definition.manifest.dependsOn) {
        await enableDeep(dep);
      }
      const row = await this.getInstall(workspaceId, userId, moduleName);
      if (row?.status === 'enabled') {
        enabledOrder.push(moduleName);
        return;
      }
      // 1) 模块迁移（管理员连接执行；每模块独立 journal 表避免互串）
      await migrate(this.adminDb, {
        migrationsFolder: mod.migrationsPath,
        migrationsTable: `module_${moduleName}_migrations`,
      });
      // 2) 安装/启用记录 + 3) 事件订阅登记（2c 派发器消费）
      await withUser(this.db, userId, async (tx) => {
        await tx
          .insert(moduleInstall)
          .values({
            workspaceId,
            moduleName,
            version: mod.definition.manifest.version,
            status: 'enabled',
            installedBy: userId,
          })
          .onConflictDoUpdate({
            target: [moduleInstall.workspaceId, moduleInstall.moduleName],
            set: {
              status: 'enabled',
              version: mod.definition.manifest.version,
              updatedAt: new Date(),
            },
          });
        for (const sub of mod.definition.manifest.events.subscribes) {
          await tx
            .insert(eventSubscription)
            .values({ moduleName, eventName: sub.event, handlerKey: sub.handler })
            .onConflictDoNothing();
        }
        await this.outbox.publishInTx(tx, {
          name: 'module.enabled',
          workspaceId,
          actorUserId: userId,
          payload: { module: moduleName, version: mod.definition.manifest.version },
        });
      });
      await this.audit.record({
        workspaceId,
        actorUserId: userId,
        action: 'module.enabled',
        objectType: 'module',
        objectId: moduleName,
        afterData: { version: mod.definition.manifest.version },
      });
      enabledOrder.push(moduleName);
    };

    await enableDeep(name);
    return enabledOrder;
  }

  /** 停用（数据保留）。存在启用的依赖方时拒绝 */
  async disable(workspaceId: string, userId: string, name: string): Promise<void> {
    const mod = await this.registry.get(name);
    if (!mod) {
      throw new NotFoundException({
        error: 'atlas.module.unknown',
        message: `模块 ${name} 不存在`,
      });
    }
    const installed = await withUser(this.db, userId, (tx) =>
      tx
        .select({ moduleName: moduleInstall.moduleName })
        .from(moduleInstall)
        .where(
          and(eq(moduleInstall.workspaceId, workspaceId), eq(moduleInstall.status, 'enabled')),
        ),
    );
    const dependents = installed
      .map((row) => row.moduleName)
      .filter((other) => other !== name)
      .filter((other) => mod.definition.manifest.dependsOn.includes(other));
    if (dependents.length > 0) {
      throw new ConflictException({
        error: 'atlas.module.dependents',
        message: `先停用依赖它的模块：${dependents.join(', ')}`,
      });
    }
    await withUser(this.db, userId, async (tx) => {
      await tx
        .update(moduleInstall)
        .set({ status: 'disabled', updatedAt: new Date() })
        .where(and(eq(moduleInstall.workspaceId, workspaceId), eq(moduleInstall.moduleName, name)));
      await this.outbox.publishInTx(tx, {
        name: 'module.disabled',
        workspaceId,
        actorUserId: userId,
        payload: { module: name },
      });
    });
    await this.audit.record({
      workspaceId,
      actorUserId: userId,
      action: 'module.disabled',
      objectType: 'module',
      objectId: name,
    });
  }

  /** 组装模块上下文（调用网关在每个租户事务内构造） */
  buildContext(mod: LoadedModule, params: ModuleCallContextParams): ModuleContext {
    const { tx, userId, workspaceId, role } = params;
    const moduleName = mod.definition.manifest.name;
    return {
      moduleName,
      userId,
      workspaceId,
      role,
      db: tx as unknown as ModuleExecutor,
      can: (permission: string) => canModule(role, permission),
      settings: {
        get: async () => {
          const rows = await tx
            .select({ settings: moduleInstall.settings })
            .from(moduleInstall)
            .where(
              and(
                eq(moduleInstall.workspaceId, workspaceId),
                eq(moduleInstall.moduleName, moduleName),
              ),
            )
            .limit(1);
          return (rows[0]?.settings as Record<string, unknown>) ?? {};
        },
        set: async (patch: Record<string, unknown>) => {
          await tx
            .update(moduleInstall)
            .set({
              settings: sql`coalesce(${moduleInstall.settings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(moduleInstall.workspaceId, workspaceId),
                eq(moduleInstall.moduleName, moduleName),
              ),
            );
        },
      },
      events: {
        publish: async (name: string, payload: Record<string, unknown>) => {
          await tx.insert(event).values({ name, payload, workspaceId });
        },
      },
      ai: {
        complete: async (prompt: string, system?: string) => {
          const response = await this.ai.complete({ prompt, system, maxTokens: 1024 });
          await tx.insert(aiUsage).values({
            workspaceId,
            userId,
            moduleName,
            model: response.model,
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
          });
          return response.text;
        },
      },
    };
  }
}
