import { and, count, desc, eq, isNull, like, notLike, sql } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { notification, user } from '../db/schema';
import { withUser } from '../db/tenant';
import type { Db } from '../db/client';
import { DB_TOKEN, MAIL_ADAPTER_TOKEN } from '../tokens';
import type { MailAdapter } from '@atlas/core';

export interface CreateNotificationInput {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  body?: Record<string, unknown>;
}

/** 通知中心（ADR-0005 §8）：站内通知 + 邮件适配器（本地打印） */
@Injectable()
export class NotificationService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(MAIL_ADAPTER_TOKEN) private readonly mail: MailAdapter,
  ) {}

  async create(entry: CreateNotificationInput): Promise<void> {
    await withUser(this.db, entry.userId, (tx) =>
      tx.insert(notification).values({
        workspaceId: entry.workspaceId,
        userId: entry.userId,
        type: entry.type,
        title: entry.title,
        body: entry.body ?? {},
      }),
    );
  }

  /** 内置订阅：member.invited 事件 → 收件人存在则发站内通知 + 邮件 */
  async handleMemberInvited(
    workspaceId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!workspaceId) return;
    const email = typeof payload.email === 'string' ? payload.email : null;
    if (!email) return;
    const role = typeof payload.role === 'string' ? payload.role : 'member';

    // 收件人可能尚未注册：存在才发站内通知；邮件无论如何都走适配器（本地打印）
    const users = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    const recipient = users[0];
    const workspaceName =
      typeof payload.workspaceName === 'string' ? payload.workspaceName : '一个工作空间';
    const subject = `你被邀请加入「${workspaceName}」`;
    if (recipient) {
      await this.create({
        workspaceId,
        userId: recipient.id,
        type: 'member.invited',
        title: subject,
        body: { role },
      });
    }
    await this.mail.send({
      to: email,
      subject,
      text: `你被邀请以 ${role} 身份加入「${workspaceName}」。登录 Atlas 后接受邀请即成为成员。`,
    });
  }

  /**
   * 通知列表。type 支持三类：listening（听歌周报等 listening.* 前缀）、
   * system（其余系统通知）、或精确的 type 值。
   */
  /** 游标分页：cursor 为最后一条的 id，行比较 (created_at, id) 保证不重不漏 */
  async list(
    userId: string,
    options: { limit?: number; type?: string; unreadOnly?: boolean; cursor?: { id: string } } = {},
  ): Promise<Array<typeof notification.$inferSelect>> {
    const limit = Math.min(options.limit ?? 50, 200);
    const filters = [eq(notification.userId, userId)];
    if (options.type === 'listening') filters.push(like(notification.type, 'listening.%'));
    else if (options.type === 'system') filters.push(notLike(notification.type, 'listening.%'));
    else if (options.type) filters.push(eq(notification.type, options.type));
    if (options.unreadOnly) filters.push(isNull(notification.readAt));
    if (options.cursor) {
      // cursor 只传 id：时间戳精度留在 PG 侧（JS Date 只有毫秒，同毫秒边界会漏行）；
      // 子查询带 user_id 校验，防止拿别人的 id 当游标探测
      filters.push(
        sql`(${notification.createdAt}, ${notification.id}) < (
          select c.created_at, c.id from platform.notification c
          where c.id = ${options.cursor.id} and c.user_id = ${userId}
        )`,
      );
    }

    return withUser(this.db, userId, (tx) =>
      tx
        .select()
        .from(notification)
        .where(and(...filters))
        .orderBy(desc(notification.createdAt), desc(notification.id))
        .limit(limit),
    );
  }

  async unreadCount(userId: string): Promise<number> {
    const rows = await withUser(this.db, userId, (tx) =>
      tx
        .select({ value: count() })
        .from(notification)
        .where(and(eq(notification.userId, userId), isNull(notification.readAt))),
    );
    return rows[0]?.value ?? 0;
  }

  async markRead(userId: string, id: string): Promise<void> {
    await withUser(this.db, userId, (tx) =>
      tx
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.id, id), eq(notification.userId, userId))),
    );
  }

  async markAllRead(userId: string): Promise<void> {
    await withUser(this.db, userId, (tx) =>
      tx
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.userId, userId), isNull(notification.readAt))),
    );
  }
}
