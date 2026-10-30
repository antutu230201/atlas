import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { Request } from 'express';
import { tap } from 'rxjs';
import type { Type } from '@nestjs/common';
import { auditLog } from '../db/schema';
import type { Db } from '../db/client';
import { withUser } from '../db/tenant';
import { AUDIT_SERVICE_TOKEN, DB_TOKEN } from '../tokens';

export interface AuditEntry {
  workspaceId?: string | null;
  actorUserId?: string | null;
  actorType?: 'user' | 'system' | 'module';
  action: string;
  objectType: string;
  objectId?: string;
  beforeData?: unknown;
  afterData?: unknown;
  ip?: string | null;
}

/** 审计服务：只追加写入（ADR-0005 §8）。敏感键在 interceptor 层已脱敏 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async record(entry: AuditEntry): Promise<void> {
    const values = {
      workspaceId: entry.workspaceId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType ?? 'user',
      action: entry.action,
      objectType: entry.objectType,
      objectId: entry.objectId ?? '',
      beforeData: entry.beforeData ?? null,
      afterData: entry.afterData ?? null,
      ip: entry.ip ?? null,
    };
    if (entry.actorUserId) {
      await withUser(this.db, entry.actorUserId, (tx) => tx.insert(auditLog).values(values));
      return;
    }
    await this.db.insert(auditLog).values(values);
  }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY = /password|token|secret|authorization/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') {
    return typeof value === 'string' && value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '***' : sanitize(item, depth + 1);
  }
  return out;
}

/** 全局写操作审计：POST/PUT/PATCH/DELETE 成功响应后记录请求体（脱敏，fire-and-forget） */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(AUDIT_SERVICE_TOKEN) private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!WRITE_METHODS.has(request.method)) return next.handle();

    return next.handle().pipe(
      tap({
        next: () => {
          const user = request.user;
          void this.audit
            .record({
              workspaceId: request.workspace?.id ?? null,
              actorUserId: user?.id ?? null,
              actorType: user ? 'user' : 'system',
              action: `${request.method} ${request.originalUrl ?? request.url}`,
              objectType: 'http',
              objectId: request.url,
              afterData: sanitize(request.body),
              ip: request.ip ?? null,
            })
            .catch((error: unknown) => {
              console.error('[audit] 写入失败：', error);
            });
        },
      }),
    );
  }
}

/** 提供全局审计拦截器的 provider 工厂（挂到任意模块 providers） */
export function provideAuditInterceptor(): { provide: string; useClass: Type<NestInterceptor> } {
  return { provide: APP_INTERCEPTOR, useClass: AuditInterceptor };
}
