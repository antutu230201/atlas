import { and, eq, isNull } from 'drizzle-orm';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Role } from '@atlas/core';
import type { Request } from 'express';
import { membership, workspace } from '../db/schema';
import { withUser } from '../db/tenant';
import type { Db } from '../db/client';
import { DB_TOKEN, SESSION_COOKIE, SESSION_SERVICE_TOKEN } from '../tokens';
import type { SessionService } from './session.service';

export interface RequestUser {
  id: string;
  email: string;
  displayName: string;
}

declare module 'express' {
  interface Request {
    /** 由 AuthGuard 解析并附加 */
    user?: RequestUser;
    /** 由 WorkspaceGuard 解析并附加 */
    workspace?: { id: string; name: string; slug: string };
    role?: Role;
  }
}

function readSessionToken(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** 认证守卫：解析会话 Cookie 并把用户附加到请求；未登录 401 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(SESSION_SERVICE_TOKEN) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionToken(request);
    if (!token) {
      throw new UnauthorizedException({ error: 'atlas.auth.unauthenticated', message: '请先登录' });
    }
    const resolved = await this.sessions.resolve(token);
    if (!resolved) {
      throw new UnauthorizedException({
        error: 'atlas.auth.session-expired',
        message: '会话已失效',
      });
    }
    request.user = { id: resolved.id, email: resolved.email, displayName: resolved.displayName };
    return true;
  }
}

export const WORKSPACE_PERMISSION_KEY = 'atlas:workspace-permission';

/**
 * 工作空间访问组合装饰器：
 * 要求登录 + 解析 :slug 对应的工作空间与成员角色（挂到 request），
 * 传入 permission 时按 RBAC 检查。非成员一律 404（不暴露存在性，与 RLS 行为一致）。
 */
export function RequireWorkspace(permission?: string) {
  return applyDecorators(
    UseGuards(WorkspaceGuard),
    SetMetadata(WORKSPACE_PERMISSION_KEY, permission),
  );
}

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({ error: 'atlas.auth.unauthenticated', message: '请先登录' });
    }
    const permission = this.reflector.get<string | undefined>(
      WORKSPACE_PERMISSION_KEY,
      context.getHandler(),
    );
    const slug = String(request.params.slug ?? '');

    const resolved = await withUser(this.db, user.id, async (tx) => {
      const wsRows = await tx
        .select({ id: workspace.id, name: workspace.name, slug: workspace.slug })
        .from(workspace)
        .where(and(eq(workspace.slug, slug), isNull(workspace.deletedAt)))
        .limit(1);
      const ws = wsRows[0];
      if (!ws) return null;
      const memRows = await tx
        .select({ role: membership.role })
        .from(membership)
        .where(and(eq(membership.workspaceId, ws.id), eq(membership.userId, user.id)))
        .limit(1);
      const role = memRows[0]?.role;
      if (!role) return null;
      return { ws, role };
    });

    if (!resolved) {
      throw new NotFoundException({
        error: 'atlas.workspace.not-found',
        message: '工作空间不存在或无权访问',
      });
    }
    if (permission && !can(resolved.role, permission)) {
      throw new ForbiddenException({
        error: 'atlas.auth.forbidden',
        message: `缺少权限 ${permission}`,
      });
    }
    request.workspace = resolved.ws;
    request.role = resolved.role;
    return true;
  }
}
