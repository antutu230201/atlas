import { and, desc, eq, gte, ilike, isNull, or } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@atlas/core';
import {
  auditLog as auditLogTable,
  invitation as invitationTable,
  membership,
  user as userTable,
  workspace,
} from '../db/schema';
import type { Db } from '../db/client';
import { withUser } from '../db/tenant';
import type { AuditService } from '../audit/audit.service';
import type { EventOutboxService } from '../events/event-outbox.service';
import type { SessionService } from '../auth/session.service';
import {
  AUDIT_SERVICE_TOKEN,
  DB_TOKEN,
  EVENT_OUTBOX_SERVICE_TOKEN,
  SESSION_SERVICE_TOKEN,
} from '../tokens';

export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
}

export interface InviteInput {
  email: string;
  role: Exclude<Role, 'owner'>;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base.length >= 3 ? base.slice(0, 40) : 'ws';
}

/** 工作空间域服务（ADR-0005 §6）：创建 / 成员 / 邀请。全部查询经 withUser 租户上下文 */
@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(AUDIT_SERVICE_TOKEN) private readonly audit: AuditService,
    @Inject(EVENT_OUTBOX_SERVICE_TOKEN) private readonly outbox: EventOutboxService,
    @Inject(SESSION_SERVICE_TOKEN) private readonly sessions: SessionService,
  ) {}

  async create(userId: string, input: CreateWorkspaceInput) {
    const base = input.slug ? slugify(input.slug) : slugify(input.name);
    // slug 唯一索引是全局的，而 RLS 让租户看不见别人的行 —— 预检查不可靠，
    // 因此以捕获 23505 + 后缀重试的方式处理冲突（同时天然防并发竞态）。
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        const created = await withUser(this.db, userId, async (tx) => {
          const wsRows = await tx
            .insert(workspace)
            .values({ name: input.name, slug: candidate, createdBy: userId })
            .returning({
              id: workspace.id,
              name: workspace.name,
              slug: workspace.slug,
              plan: workspace.plan,
              createdAt: workspace.createdAt,
            });
          const ws = wsRows[0];
          if (!ws) throw new Error('工作空间创建失败');
          await tx.insert(membership).values({ workspaceId: ws.id, userId, role: 'owner' });
          await this.outbox.publishInTx(tx, {
            name: 'workspace.created',
            workspaceId: ws.id,
            actorUserId: userId,
            payload: { name: ws.name, slug: ws.slug },
          });
          return ws;
        });
        await this.audit.record({
          actorUserId: userId,
          action: 'workspace.created',
          objectType: 'workspace',
          objectId: created.id,
          afterData: { name: created.name, slug: created.slug },
        });
        return created;
      } catch (error) {
        lastError = error;
        const cause =
          (error as { cause?: { code?: string }; code?: string }).cause?.code ??
          (error as { code?: string }).code;
        if (cause !== '23505') throw error;
      }
    }
    throw new ConflictException({
      error: 'atlas.workspace.slug-taken',
      message: 'slug 已被占用',
      cause: lastError instanceof Error ? lastError.message : undefined,
    });
  }

  async listMine(userId: string) {
    return withUser(this.db, userId, (tx) =>
      tx
        .select({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          plan: workspace.plan,
          role: membership.role,
          joinedAt: membership.createdAt,
        })
        .from(membership)
        .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
        .where(and(eq(membership.userId, userId), isNull(workspace.deletedAt)))
        .orderBy(membership.createdAt),
    );
  }

  async get(workspaceId: string, userId: string) {
    return withUser(this.db, userId, async (tx) => {
      const rows = await tx
        .select({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          plan: workspace.plan,
          settings: workspace.settings,
          createdAt: workspace.createdAt,
        })
        .from(workspace)
        .where(eq(workspace.id, workspaceId))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async listMembers(workspaceId: string, userId: string) {
    return withUser(this.db, userId, (tx) =>
      tx
        .select({
          userId: membership.userId,
          role: membership.role,
          joinedAt: membership.createdAt,
          email: userTable.email,
          displayName: userTable.displayName,
        })
        .from(membership)
        .innerJoin(userTable, eq(userTable.id, membership.userId))
        .where(eq(membership.workspaceId, workspaceId))
        .orderBy(membership.createdAt),
    );
  }

  async invite(workspaceId: string, actor: { userId: string; role: Role }, input: InviteInput) {
    const email = input.email.trim().toLowerCase();
    const invited = await withUser(this.db, actor.userId, async (tx) => {
      const memberRows = await tx
        .select({ id: membership.id })
        .from(membership)
        .innerJoin(userTable, eq(userTable.id, membership.userId))
        .where(and(eq(membership.workspaceId, workspaceId), eq(userTable.email, email)))
        .limit(1);
      if (memberRows.length > 0) {
        throw new ConflictException({
          error: 'atlas.invitation.already-member',
          message: '该用户已是成员',
        });
      }
      const pending = await tx
        .select({ id: invitationTable.id })
        .from(invitationTable)
        .where(
          and(
            eq(invitationTable.workspaceId, workspaceId),
            eq(invitationTable.email, email),
            isNull(invitationTable.acceptedAt),
          ),
        )
        .limit(1);
      if (pending.length > 0) {
        throw new ConflictException({
          error: 'atlas.invitation.pending',
          message: '该邮箱已有待处理邀请',
        });
      }
      const wsNameRows = await tx
        .select({ name: workspace.name })
        .from(workspace)
        .where(eq(workspace.id, workspaceId))
        .limit(1);
      const workspaceName = wsNameRows[0]?.name ?? '';
      const token = this.sessions.newInvitationToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await tx.insert(invitationTable).values({
        workspaceId,
        email,
        role: input.role,
        tokenHash: this.sessions.hashToken(token),
        invitedBy: actor.userId,
        expiresAt,
      });
      await this.outbox.publishInTx(tx, {
        name: 'member.invited',
        workspaceId,
        actorUserId: actor.userId,
        payload: { email, role: input.role, workspaceName },
      });
      return { token, expiresAt };
    });
    await this.audit.record({
      workspaceId,
      actorUserId: actor.userId,
      action: 'member.invited',
      objectType: 'invitation',
      objectId: email,
      afterData: { role: input.role },
    });
    // 本地开发：邀请令牌直接返回给邀请人（生产经邮件适配器送达，阶段 2c/8）
    return invited;
  }

  async updateMemberRole(
    workspaceId: string,
    actor: { userId: string; role: Role },
    targetUserId: string,
    role: Role,
  ) {
    if (role === 'owner') {
      throw new ConflictException({
        error: 'atlas.member.owner-immutable',
        message: 'owner 角色只能通过转让获得',
      });
    }
    const updated = await withUser(this.db, actor.userId, async (tx) => {
      const targetRows = await tx
        .select({ role: membership.role })
        .from(membership)
        .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, targetUserId)))
        .limit(1);
      const target = targetRows[0];
      if (!target)
        throw new NotFoundException({ error: 'atlas.member.not-found', message: '成员不存在' });
      if (target.role === 'owner') {
        throw new ConflictException({
          error: 'atlas.member.owner-immutable',
          message: '不能修改 owner 的角色',
        });
      }
      await tx
        .update(membership)
        .set({ role })
        .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, targetUserId)));
      await this.outbox.publishInTx(tx, {
        name: 'member.role-changed',
        workspaceId,
        actorUserId: actor.userId,
        payload: { targetUserId, before: target.role, after: role },
      });
      return { before: target.role, after: role };
    });
    await this.audit.record({
      workspaceId,
      actorUserId: actor.userId,
      action: 'member.role-changed',
      objectType: 'membership',
      objectId: targetUserId,
      beforeData: updated.before,
      afterData: updated.after,
    });
    return updated;
  }

  async removeMember(
    workspaceId: string,
    actor: { userId: string; role: Role },
    targetUserId: string,
  ) {
    if (targetUserId === actor.userId) {
      throw new ConflictException({
        error: 'atlas.member.self-removal',
        message: '暂不支持自行退出（阶段 3 提供）',
      });
    }
    await withUser(this.db, actor.userId, async (tx) => {
      const targetRows = await tx
        .select({ role: membership.role })
        .from(membership)
        .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, targetUserId)))
        .limit(1);
      const target = targetRows[0];
      if (!target)
        throw new NotFoundException({ error: 'atlas.member.not-found', message: '成员不存在' });
      if (target.role === 'owner') {
        throw new ConflictException({
          error: 'atlas.member.owner-immutable',
          message: '不能移除 owner',
        });
      }
      await tx
        .delete(membership)
        .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, targetUserId)));
      await this.outbox.publishInTx(tx, {
        name: 'member.removed',
        workspaceId,
        actorUserId: actor.userId,
        payload: { targetUserId, previousRole: target.role },
      });
      return target.role;
    });
    await this.audit.record({
      workspaceId,
      actorUserId: actor.userId,
      action: 'member.removed',
      objectType: 'membership',
      objectId: targetUserId,
    });
  }

  /** 审计查询：时间范围与关键词在 SQL 侧过滤，避免全量返回后前端筛选 */
  async listAudit(
    workspaceId: string,
    userId: string,
    options: { days?: number; q?: string; limit?: number } = {},
  ) {
    const filters = [eq(auditLogTable.workspaceId, workspaceId)];
    if (options.days && options.days > 0) {
      filters.push(gte(auditLogTable.createdAt, new Date(Date.now() - options.days * 86_400_000)));
    }
    const q = options.q?.trim();
    if (q) {
      // LIKE 通配符转义：匹配到的 % 或 _ 前补反斜杠（$& 为整个匹配）
      const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;
      filters.push(
        or(
          ilike(auditLogTable.action, pattern),
          ilike(auditLogTable.objectType, pattern),
          ilike(auditLogTable.objectId, pattern),
          ilike(auditLogTable.actorType, pattern),
        )!,
      );
    }
    return withUser(this.db, userId, (tx) =>
      tx
        .select()
        .from(auditLogTable)
        .where(and(...filters))
        .orderBy(desc(auditLogTable.createdAt))
        .limit(Math.min(options.limit ?? 50, 200)),
    );
  }
}
