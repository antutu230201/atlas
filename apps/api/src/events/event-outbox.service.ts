import { Inject, Injectable } from '@nestjs/common';
import { event } from '../db/schema';
import type { ApiEnv } from '../env';
import type { Db } from '../db/client';
import { DB_TOKEN, ENV_TOKEN } from '../tokens';

export interface OutboxEntry {
  name: string;
  workspaceId?: string | null;
  actorUserId?: string | null;
  payload: Record<string, unknown>;
}

/**
 * 事件 outbox 写入器（ADR-0005 §8）：
 * 必须在与业务数据同一个事务内调用 —— 这是"事件不丢"的第一保证。
 */
@Injectable()
export class EventOutboxService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(ENV_TOKEN) private readonly env: ApiEnv,
  ) {}

  /** 在给定事务/连接上落一条事件（workspaceId 可空 = 全局事件） */
  async publishInTx(tx: Db, entry: OutboxEntry): Promise<void> {
    await tx.insert(event).values({
      name: entry.name,
      payload: entry.payload,
      workspaceId: entry.workspaceId ?? null,
      actorUserId: entry.actorUserId ?? null,
      maxAttempts: this.env.EVENT_MAX_ATTEMPTS,
    });
  }
}
