import { and, desc, eq, isNull } from 'drizzle-orm';
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

  async list(userId: string, limit = 50) {
    return withUser(this.db, userId, (tx) =>
      tx
        .select()
        .from(notification)
        .where(eq(notification.userId, userId))
        .orderBy(desc(notification.createdAt))
        .limit(Math.min(limit, 200)),
    );
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
