import { z } from 'zod';
import type { Role } from '@atlas/core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * 模块协议（ADR-0005 §7）。
 *
 * 模块以工作区包（@atlas/module-*）形式交付：
 * - 服务端：ModuleDefinition（manifest + action handlers），由内核运行时动态发现并经
 *   统一网关 POST /v1/workspaces/:slug/modules/:name/call/:action 分发；
 * - 数据库：模块自建 `modules.<name>` schema 与迁移（启用时由内核执行）；
 * - 前端：页面组件随应用外壳挂载（阶段 3）。
 */

export const moduleManifestSchema = z.object({
  /** 模块名 = 数据库 schema 名（modules.<name>），如 todo_notes */
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]{2,39}$/, '模块名：小写字母开头，3–40 位小写字母/数字/下划线'),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'semver'),
  title: z.string().min(1).max(80),
  description: z.string().max(300),
  icon: z.string().max(40).optional(),
  /** 声明所需的权限点（启用时向管理员展示） */
  permissions: z.array(z.string().regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/)).max(50),
  /** 依赖的其他模块；启用时自动按序启用 */
  dependsOn: z.array(z.string()).max(20),
  /** 前端路由（相对 /m/<name>；由应用外壳动态挂载） */
  routes: z
    .array(
      z.object({
        path: z.string().regex(/^[a-z0-9-]*$/, '路由段：小写字母/数字/连字符'),
        title: z.string().min(1).max(80),
        nav: z
          .object({
            order: z.number().int().min(0).max(9999),
            icon: z.string().max(40).optional(),
          })
          .optional(),
      }),
    )
    .max(50),
  /** 首页小组件声明（id → 模块 web 注册表的 widget 键） */
  widgets: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        title: z.string().min(1).max(80),
        component: z.string().min(1).max(80),
        span: z.number().int().min(1).max(4).optional(),
      }),
    )
    .optional(),
  /** 工作空间级设置项（渲染与校验由内核设置页完成） */
  settings: z
    .array(
      z.object({
        key: z.string().min(1).max(60),
        label: z.string().min(1).max(80),
        type: z.enum(['text', 'number', 'boolean', 'select']),
        default: z.unknown().optional(),
        options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
      }),
    )
    .optional(),
  events: z.object({
    publishes: z.array(z.string().regex(/^[a-z][a-z0-9_.]*$/)).max(100),
    subscribes: z
      .array(
        z.object({
          /** 支持通配：todo.* / * */
          event: z.string().regex(/^[a-z*][a-z0-9_.*]*$/),
          /** 本模块 actions 中的处理器键 */
          handler: z.string().min(1).max(80),
        }),
      )
      .max(100),
  }),
  /** 模块迁移目录（包内相对路径） */
  migrations: z.string().default('migrations'),
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

/** 模块上下文：模块代码访问内核能力的唯一入口（架构铁律：禁止直连数据库/读取他模块） */
export interface ModuleContext {
  readonly moduleName: string;
  readonly userId: string;
  /** 当前调用者显示名（网关从会话透传；用于快照类展示字段，免跨 schema 联表） */
  readonly displayName: string;
  readonly workspaceId: string;
  readonly role: Role;
  /** 租户事务内的 Drizzle 执行器：RLS 已按当前用户绑定；同一调用内所有读写同事务 */
  readonly db: ModuleExecutor;
  /** 权限判定（模块权限点：guest 只读 / member+ 读写） */
  can(permission: string): boolean;
  /** 工作空间级模块设置（module_install.settings jsonb） */
  settings: {
    get(): Promise<Record<string, unknown>>;
    set(patch: Record<string, unknown>): Promise<void>;
  };
  /** 事件发布（outbox 同事务落库；2c 接入派发器） */
  events: {
    publish(name: string, payload: Record<string, unknown>): Promise<void>;
  };
  /** AI 能力（阶段 5）：模块通过 ctx.ai.complete() 调用平台配置的 AI 供应商 */
  ai: {
    complete(prompt: string, system?: string): Promise<string>;
  };
}

/** 模块内可用的 Drizzle 执行器（与内核 Db 同形，避免向模块泄露连接管理） */
export type ModuleExecutor = NodePgDatabase<Record<string, never>>;

export interface ModuleAction {
  /** 调用该动作所需权限点，如 note:write */
  permission: string;
  handler: (ctx: ModuleContext, input: unknown) => Promise<unknown>;
}

/** 模块定义 = manifest + action 集合（模块包的主入口导出 `definition`） */
export interface ModuleDefinition {
  manifest: ModuleManifest;
  actions: Record<string, ModuleAction>;
}

/** 模块动作的业务错误：网关映射为 400（校验失败/资源不存在等），其余错误仍为 500 */
export class ModuleActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleActionError';
  }
}

export function parseManifest(input: unknown): ModuleManifest {
  const parsed = moduleManifestSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`模块 manifest 校验失败：${detail}`);
  }
  return parsed.data;
}
