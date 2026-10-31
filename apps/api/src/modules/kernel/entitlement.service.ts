import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { entitlement } from '../../db/schema';
import { withUser } from '../../db/tenant';
import { DB_TOKEN } from '../../tokens';

export interface EntitlementCheck {
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
}

/**
 * 权益执行（ADR-0005 阶段 7）：
 * 业务代码只问 hasFeature(workspaceId, featureKey)，不写死套餐名。
 * entitlement 表由管理接口维护（阶段 7 完整计费时接入支付回调）。
 */
@Injectable()
export class EntitlementService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /** 检查工作空间是否拥有某个特性 */
  async hasFeature(workspaceId: string, userId: string, featureKey: string): Promise<boolean> {
    const rows = await withUser(this.db, userId, (tx) =>
      tx
        .select({ enabled: entitlement.enabled })
        .from(entitlement)
        .where(
          and(eq(entitlement.workspaceId, workspaceId), eq(entitlement.featureKey, featureKey)),
        )
        .limit(1),
    );
    // 无记录 = 默认允许（免费层基础功能）；有记录则看 enabled
    return rows.length === 0 ? true : rows[0]!.enabled;
  }

  /** 获取额度限制（null = 不限额） */
  async getLimit(workspaceId: string, userId: string, featureKey: string): Promise<number | null> {
    const rows = await withUser(this.db, userId, (tx) =>
      tx
        .select({ limitValue: entitlement.limitValue })
        .from(entitlement)
        .where(
          and(eq(entitlement.workspaceId, workspaceId), eq(entitlement.featureKey, featureKey)),
        )
        .limit(1),
    );
    return rows[0]?.limitValue ?? null;
  }
}
