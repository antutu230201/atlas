import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { MailAdapter } from '@atlas/core';
import { eventSubscription } from '../db/schema';
import { withUser } from '../db/tenant';
import type { Db } from '../db/client';
import {
  ADMIN_DB_TOKEN,
  DB_TOKEN,
  ENV_TOKEN,
  MAIL_ADAPTER_TOKEN,
  MODULE_REGISTRY_SERVICE_TOKEN,
  MODULE_SERVICE_TOKEN,
  NOTIFICATION_SERVICE_TOKEN,
} from '../tokens';
import type { ApiEnv } from '../env';
import type { ModuleRegistryService } from '../modules/kernel/module-registry';
import type { ModuleService } from '../modules/kernel/module.service';
import type { NotificationService } from './notification.service';

interface ClaimedEvent {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  workspace_id: string | null;
  actor_user_id: string | null;
  attempts: number;
  max_attempts: number;
}

export interface DispatchResult {
  claimed: number;
  delivered: number;
  retried: number;
}

/**
 * 事件派发器（ADR-0005 §8）：
 * - 认领：UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) 原子认领，多实例安全；
 * - 投递：按 event_subscription（精确 + 前缀通配 + *）分发给已启用模块的 handler，
 *   一个事件一个租户事务（at-least-once，handler 必须幂等）；
 * - 失败：退避 5s × 2^attempts 重试，耗尽进死信；
 * - 僵死：processing 超 5 分钟（进程崩溃遗留）自动回收重投。
 * kernel 内置订阅：member.invited → 站内通知 + 邮件适配器。
 */
@Injectable()
export class EventDispatcherService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(ADMIN_DB_TOKEN) private readonly adminDb: Db,
    @Inject(ENV_TOKEN) private readonly env: ApiEnv,
    @Inject(MODULE_REGISTRY_SERVICE_TOKEN) private readonly registry: ModuleRegistryService,
    @Inject(MODULE_SERVICE_TOKEN) private readonly moduleService: ModuleService,
    @Inject(NOTIFICATION_SERVICE_TOKEN) private readonly notifications: NotificationService,
    @Inject(MAIL_ADAPTER_TOKEN) private readonly mail: MailAdapter,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.DISPATCHER_ENABLED) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.runOnce()
        .catch((error: unknown) => console.error('[dispatcher] 轮询失败：', error))
        .finally(() => {
          this.running = false;
        });
    }, this.env.DISPATCH_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** 单轮派发（测试与手动触发入口）：返回认领/投递/重试计数 */
  async runOnce(): Promise<DispatchResult> {
    // 0) 僵死回收：崩溃遗留的 processing 行超 5 分钟 → 回到 pending
    await this.adminDb.execute(sql`
      update platform.event set status = 'pending', claimed_at = null
      where status = 'processing' and claimed_at < now() - interval '5 minutes'
    `);

    // 1) 原子认领一批
    const claimed = await this.adminDb.execute<Record<string, unknown>>(sql`
      update platform.event set status = 'processing', claimed_at = now()
      where id in (
        select id from platform.event
        where status = 'pending' and next_attempt_at <= now()
        order by created_at
        limit 20
        for update skip locked
      )
      returning id, name, payload, workspace_id, actor_user_id, attempts, max_attempts
    `);

    let delivered = 0;
    let retried = 0;
    for (const row of claimed.rows as unknown as ClaimedEvent[]) {
      const outcome = await this.deliver(row);
      if (outcome === 'delivered') delivered += 1;
      else retried += 1;
    }
    return { claimed: claimed.rows.length, delivered, retried };
  }

  private async deliver(row: ClaimedEvent): Promise<'delivered' | 'retry'> {
    try {
      const subscriptions = await this.activeSubscriptionsFor(row);
      for (const subscription of subscriptions) {
        await this.deliverToModule(row, subscription);
      }
      // 内核内置订阅：邀请 → 站内通知 + 邮件
      if (row.name === 'member.invited') {
        await this.notifications.handleMemberInvited(row.workspace_id, row.payload);
      }
      await this.adminDb.execute(sql`
        update platform.event set status = 'delivered', delivered_at = now(), claimed_at = null
        where id = ${row.id}
      `);
      return 'delivered';
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= row.max_attempts) {
        await this.adminDb.execute(sql`
          update platform.event set status = 'dead', attempts = ${attempts}, last_error = ${message}, claimed_at = null
          where id = ${row.id}
        `);
      } else {
        const backoffMs = 5000 * 2 ** attempts;
        await this.adminDb.execute(sql`
          update platform.event set status = 'pending', attempts = ${attempts},
            next_attempt_at = now() + (${backoffMs} || ' milliseconds')::interval,
            last_error = ${message}, claimed_at = null
          where id = ${row.id}
        `);
      }
      return 'retry';
    }
  }

  /** 匹配订阅（精确 / 前缀通配 todo.* / 全局 *），且订阅模块在该工作空间仍启用 */
  private async activeSubscriptionsFor(
    row: ClaimedEvent,
  ): Promise<Array<{ moduleName: string; handlerKey: string }>> {
    const all = await this.adminDb.select().from(eventSubscription);
    const matched = all.filter((s) => {
      if (s.eventName === '*') return true;
      if (s.eventName.endsWith('.*')) return row.name.startsWith(s.eventName.slice(0, -1));
      return s.eventName === row.name;
    });
    const result: Array<{ moduleName: string; handlerKey: string }> = [];
    for (const subscription of matched) {
      if (!row.workspace_id) {
        result.push({ moduleName: subscription.moduleName, handlerKey: subscription.handlerKey });
        continue;
      }
      const installs = await this.adminDb.execute(sql`
        select status from platform.module_install
        where workspace_id = ${row.workspace_id} and module_name = ${subscription.moduleName}
        limit 1
      `);
      const status = (installs.rows[0] as { status: string } | undefined)?.status;
      if (status === 'enabled') {
        result.push({ moduleName: subscription.moduleName, handlerKey: subscription.handlerKey });
      }
    }
    return result;
  }

  private async deliverToModule(
    row: ClaimedEvent,
    subscription: { moduleName: string; handlerKey: string },
  ): Promise<void> {
    const mod = await this.registry.get(subscription.moduleName);
    if (!mod) return;
    const action = mod.definition.actions[subscription.handlerKey];
    if (!action) return;

    const run = async (tx: Db, userId: string | null) => {
      const context = this.moduleService.buildContext(mod, {
        tx,
        userId: userId ?? row.actor_user_id ?? '',
        workspaceId: row.workspace_id ?? '',
        role: 'admin',
      });
      await action.handler(context, row.payload);
    };

    if (row.actor_user_id && row.workspace_id) {
      await withUser(this.db, row.actor_user_id, (tx) => run(tx, row.actor_user_id));
    } else {
      // 全局事件 / 无触发者：系统通道（管理员连接，绕过 RLS）
      await run(this.adminDb, null);
    }
  }

  /** 供内核订阅发送邮件（通知服务内部也可直接使用） */
  async sendMail(to: string, subject: string, text: string): Promise<void> {
    await this.mail.send({ to, subject, text });
  }
}
