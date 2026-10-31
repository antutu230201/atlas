/**
 * 依赖注入令牌与常量。
 * 约定（ADR-0005 实现记录）：所有注入一律用显式 @Inject(token)，
 * 不依赖 emitDecoratorMetadata（vitest/esbuild 转换不产出元数据）。
 */

/** 与 apps/api/package.json 的 version 保持同步；阶段 8 换为构建注入 */
export const API_VERSION = '0.1.0';

export const ENV_TOKEN = Symbol('API_ENV');
export const DB_TOKEN = Symbol('DB');
/** 管理员连接（迁移属主 atlas，绕过 RLS）：仅限"入会前"等特权流程显式使用 */
export const ADMIN_DB_TOKEN = Symbol('ADMIN_DB');
export const PROBES_TOKEN = Symbol('HEALTH_PROBES');
export const HEALTH_SERVICE_TOKEN = Symbol('HEALTH_SERVICE');

export const SESSION_SERVICE_TOKEN = Symbol('SESSION_SERVICE');
export const RATE_LIMIT_SERVICE_TOKEN = Symbol('RATE_LIMIT_SERVICE');
export const AUTH_SERVICE_TOKEN = Symbol('AUTH_SERVICE');
export const AUDIT_SERVICE_TOKEN = Symbol('AUDIT_SERVICE');
export const WORKSPACE_SERVICE_TOKEN = Symbol('WORKSPACE_SERVICE');
export const MODULE_REGISTRY_SERVICE_TOKEN = Symbol('MODULE_REGISTRY_SERVICE');
export const MODULE_SERVICE_TOKEN = Symbol('MODULE_SERVICE');
export const EVENT_OUTBOX_SERVICE_TOKEN = Symbol('EVENT_OUTBOX_SERVICE');
export const NOTIFICATION_SERVICE_TOKEN = Symbol('NOTIFICATION_SERVICE');
export const MAIL_ADAPTER_TOKEN = Symbol('MAIL_ADAPTER');

/** 会话 Cookie 名；令牌明文只在 Cookie，库存 sha256 */
export const SESSION_COOKIE = 'atlas_session';
