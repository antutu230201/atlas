import { createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DB_TOKEN } from '../tokens';
import type { Db } from '../db/client';
import { session, user } from '../db/schema/identity';
import { newSessionToken } from './password';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'blocked';
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/** 会话存取：令牌明文只在 Cookie，库存 sha256（ADR-0005 §5） */
@Injectable()
export class SessionService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async create(
    userId: string,
    meta: { ip?: string | null; device?: string },
    ttlDays: number,
  ): Promise<CreatedSession> {
    const token = newSessionToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.db.insert(session).values({
      userId,
      tokenHash,
      device: meta.device ?? '',
      ip: meta.ip ?? null,
      expiresAt,
    });
    return { token, expiresAt };
  }

  /** 解析会话：未过期、未吊销、用户 active 且未软删除 */
  async resolve(token: string): Promise<AuthUser | null> {
    const tokenHash = this.hashToken(token);
    const rows = await this.db
      .select({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
      })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(
        and(
          eq(session.tokenHash, tokenHash),
          isNull(session.revokedAt),
          gt(session.expiresAt, new Date()),
          eq(user.status, 'active'),
          isNull(user.deletedAt),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ?? null;
  }

  async revoke(token: string): Promise<void> {
    await this.db
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.tokenHash, this.hashToken(token)), isNull(session.revokedAt)));
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** 生成一次性邀请令牌（复用会话令牌的随机源与哈希通道） */
  newInvitationToken(): string {
    return randomBytes(24).toString('base64url');
  }
}
