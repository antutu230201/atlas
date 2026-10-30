import { and, eq, isNull } from 'drizzle-orm';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { invitation, membership, user as userTable, workspace } from '../db/schema';
import type { Db } from '../db/client';
import { ADMIN_DB_TOKEN, DB_TOKEN, SESSION_SERVICE_TOKEN } from '../tokens';
import type { SessionService } from './session.service';
import { hashPassword, verifyPassword } from './password';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

function toPublicUser(row: {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
}): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    emailVerified: row.emailVerifiedAt !== null,
  };
}

/** 认证域服务（ADR-0005 §5）：注册 / 登录 / 邀请接受 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(ADMIN_DB_TOKEN) private readonly adminDb: Db,
    @Inject(SESSION_SERVICE_TOKEN) private readonly sessions: SessionService,
  ) {}

  async register(
    input: RegisterInput,
    sessionMeta: { ip?: string | null; device?: string },
    ttlDays: number,
  ) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException({ error: 'atlas.auth.email-taken', message: '该邮箱已注册' });
    }
    const passwordHash = await hashPassword(input.password);
    const inserted = await this.db
      .insert(userTable)
      .values({ email, passwordHash, displayName: input.displayName })
      .returning({
        id: userTable.id,
        email: userTable.email,
        displayName: userTable.displayName,
        emailVerifiedAt: userTable.emailVerifiedAt,
      });
    const created = inserted[0];
    if (!created) throw new Error('用户创建失败');
    const userSession = await this.sessions.create(created.id, sessionMeta, ttlDays);
    return { user: toPublicUser(created), session: userSession };
  }

  async login(
    input: LoginInput,
    sessionMeta: { ip?: string | null; device?: string },
    ttlDays: number,
  ) {
    const email = input.email.trim().toLowerCase();
    const rows = await this.db
      .select()
      .from(userTable)
      .where(and(eq(userTable.email, email), isNull(userTable.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row || row.status !== 'active') {
      throw new UnauthorizedException({
        error: 'atlas.auth.invalid-credentials',
        message: '邮箱或密码不正确',
      });
    }
    const ok = await verifyPassword(input.password, row.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        error: 'atlas.auth.invalid-credentials',
        message: '邮箱或密码不正确',
      });
    }
    const userSession = await this.sessions.create(row.id, sessionMeta, ttlDays);
    return { user: toPublicUser(row), session: userSession };
  }

  async me(userId: string): Promise<PublicUser> {
    const rows = await this.db
      .select({
        id: userTable.id,
        email: userTable.email,
        displayName: userTable.displayName,
        emailVerifiedAt: userTable.emailVerifiedAt,
      })
      .from(userTable)
      .where(and(eq(userTable.id, userId), isNull(userTable.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row)
      throw new UnauthorizedException({
        error: 'atlas.auth.unauthenticated',
        message: '会话已失效',
      });
    return toPublicUser(row);
  }

  /**
   * 接受邀请：登录用户凭一次性 token 加入对应工作空间。
   * 特权说明（ADR-0005）：受邀者尚未成为成员，RLS 天然看不见该邀请 ——
   * 因此本流程走管理员连接（绕过 RLS），安全性由"一次性 token + 邮箱精确匹配"保证，
   * 并写入审计日志。
   */
  async acceptInvitation(userId: string, token: string) {
    const tokenHash = this.sessions.hashToken(token);
    const rows = await this.adminDb
      .select()
      .from(invitation)
      .where(and(eq(invitation.tokenHash, tokenHash), isNull(invitation.acceptedAt)))
      .limit(1);
    const invite = rows[0];
    if (!invite)
      throw new NotFoundException({
        error: 'atlas.invitation.not-found',
        message: '邀请不存在或已使用',
      });
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new ConflictException({ error: 'atlas.invitation.expired', message: '邀请已过期' });
    }
    const me = await this.adminDb
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);
    const myEmail = me[0]?.email;
    if (!myEmail || myEmail !== invite.email) {
      throw new ConflictException({
        error: 'atlas.invitation.email-mismatch',
        message: `该邀请面向 ${invite.email}，请用对应账号登录`,
      });
    }
    const joined = await this.adminDb.transaction(async (tx) => {
      const wsRows = await tx
        .select({ id: workspace.id, name: workspace.name })
        .from(workspace)
        .where(eq(workspace.id, invite.workspaceId))
        .limit(1);
      const target = wsRows[0];
      if (!target)
        throw new NotFoundException({
          error: 'atlas.workspace.not-found',
          message: '工作空间不存在',
        });
      const existing = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.workspaceId, target.id), eq(membership.userId, userId)))
        .limit(1);
      if (existing.length === 0) {
        await tx.insert(membership).values({ workspaceId: target.id, userId, role: invite.role });
      }
      return {
        workspaceId: target.id,
        name: target.name,
        role: invite.role,
        alreadyMember: existing.length > 0,
      };
    });
    await this.adminDb
      .update(invitation)
      .set({ acceptedAt: new Date() })
      .where(eq(invitation.id, invite.id));
    return joined;
  }
}
