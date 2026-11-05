import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * 环境变量契约：启动时校验，缺失/非法即报错退出（AGENTS.md 质量标准 5）。
 * 本地开发全部字段都有安全默认值，因此 `pnpm dev` 零配置可跑；
 * .env 文件可选（参考根目录 .env.example）。
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** 应用运行时连接（受 RLS 约束的 atlas_app 角色，ADR-0005 §4） */
  DATABASE_URL: z.url().default('postgres://atlas_app:atlas_app@localhost:5432/atlas'),
  /** 迁移与管理连接（embedded-postgres 初始化的 atlas 用户） */
  DATABASE_URL_ADMIN: z.url().default('postgres://atlas:atlas@localhost:5432/atlas'),
  /** true 时由 API 进程拉起内嵌 PostgreSQL（ADR-0002）；连接外部 PG 时设为 false */
  EMBEDDED_PG: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
  /** 内嵌 PostgreSQL 数据目录，相对于 apps/api */
  PG_DATA_DIR: z.string().default('.local/pgdata'),
  /** 本地磁盘存储根目录（StorageAdapter 的 LocalDisk 实现），相对于 apps/api */
  STORAGE_DIR: z.string().default('.local/storage'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** 会话有效期（天） */
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** 事件派发器轮询间隔（毫秒）；测试中可关闭自动派发 */
  DISPATCH_INTERVAL_MS: z.coerce.number().int().min(200).max(60_000).default(2000),
  DISPATCHER_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
  EVENT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  /** AI 供应商（OpenAI 兼容协议，阶段 5）：API 密钥为空时回落 MockAIProvider，零配置可跑 */
  AI_API_KEY: z.string().default(''),
  /** OpenAI 兼容 base URL：TokenRhythm / DeepSeek / OpenAI / 智谱等 */
  AI_BASE_URL: z.string().default('https://tokenrhythm.studio/v1'),
  /** 模型名，以供应商 /v1/models 实际返回为准 */
  AI_MODEL: z.string().default('deepseek-v4.1-flash-1017'),
  /** AI 单次请求超时（毫秒） */
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
});

export type ApiEnv = z.infer<typeof envSchema>;

/** 纯函数便于测试：非法输入抛出带明细的中文错误 */
export function parseEnv(input: Record<string, string | undefined>): ApiEnv {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`环境变量校验失败：${detail}`);
  }
  return parsed.data;
}

/** 从 apps/api/.env（若存在）加载后校验进程环境变量；以进程工作目录为锚 */
export function loadEnv(): ApiEnv {
  loadDotenv({ path: resolve(process.cwd(), '.env') });
  return parseEnv(process.env);
}
