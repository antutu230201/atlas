import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AIAdapter, AICompletionRequest, AICompletionResponse } from '@atlas/core';
import { MockAIProvider, OpenAICompatProvider } from '@atlas/core';
import { appSetting } from '../db/schema/platform';
import type { Db } from '../db/client';

/**
 * 部署级全局配置（platform.app_setting 键值表）。当前唯一键：ai_provider。
 * AI_API_KEY 等环境变量仍是"出厂默认"——界面配置存库并即时热切换，优先级高于 env。
 */

export const AI_SETTING_KEY = 'ai_provider';

export const aiConfigSchema = z.object({
  baseUrl: z.string().url('Base URL 必须是合法 URL'),
  apiKey: z.string(),
  model: z.string().min(1, '模型名不能为空').max(120),
  timeoutMs: z.number().int().min(1000).max(120_000),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;

/** 对外呈现：绝不包含明文 key */
export interface AiConfigView {
  source: 'db' | 'env' | 'mock';
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keyMasked: string | null;
}

const DEFAULT_BASE_URL = 'https://tokenrhythm.studio/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash-1017';
const DEFAULT_TIMEOUT_MS = 30_000;

export function maskKey(key: string): string | null {
  if (!key) return null;
  if (key.length <= 8) return '***';
  return `${key.slice(0, 5)}***${key.slice(-4)}`;
}

/** 从 env 契约值构造出厂配置（无 key 视为未配置） */
export interface AiEnvDefaults {
  AI_API_KEY: string;
  AI_BASE_URL: string;
  AI_MODEL: string;
  AI_TIMEOUT_MS: number;
}

export function envDefaultsToConfig(env: AiEnvDefaults): AiConfig | null {
  if (!env.AI_API_KEY) return null;
  return {
    baseUrl: env.AI_BASE_URL,
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL,
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}

/** 读库（无行返回 null）；解析失败按未配置处理并原样保留以便排查 */
export async function readAiConfigFromDb(db: Db): Promise<AiConfig | null> {
  const rows = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, AI_SETTING_KEY))
    .limit(1);
  const raw = rows[0]?.value;
  if (!raw || typeof raw !== 'object') return null;
  const parsed = aiConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function writeAiConfigToDb(
  db: Db,
  config: AiConfig | null,
  updatedBy: string | null,
): Promise<void> {
  await db
    .insert(appSetting)
    .values({
      key: AI_SETTING_KEY,
      value: (config ?? {}) as unknown as Record<string, unknown>,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: {
        value: (config ?? {}) as unknown as Record<string, unknown>,
        updatedBy,
        updatedAt: new Date(),
      },
    });
}

export function instantiateAdapter(config: AiConfig | null, env: AiEnvDefaults): AIAdapter {
  const effective = config ?? envDefaultsToConfig(env);
  if (!effective) return new MockAIProvider();
  return new OpenAICompatProvider({
    baseUrl: effective.baseUrl,
    apiKey: effective.apiKey,
    model: effective.model,
    name: 'ai-openai-compat',
    timeoutMs: effective.timeoutMs,
  });
}

/** 配置表单补丁：apiKey undefined=保持不变；null/''=清除 */
export interface AiConfigPatch {
  apiKey?: string | null;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

/** 把表单补丁合并到当前有效配置（无配置时回落 env，再无 key 则 null=Mock） */
export function mergeAiConfig(
  patch: AiConfigPatch,
  current: AiConfig | null,
  env: AiEnvDefaults,
): AiConfig | null {
  const base = current ??
    envDefaultsToConfig(env) ?? {
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      model: DEFAULT_MODEL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
  const apiKey =
    patch.apiKey === undefined
      ? base.apiKey // 保持不变
      : patch.apiKey && patch.apiKey.length > 0
        ? patch.apiKey // 设置新值
        : ''; // null / '' = 清除（回落 env / Mock）
  if (!apiKey) return null;
  return aiConfigSchema.parse({
    baseUrl: patch.baseUrl ?? base.baseUrl,
    apiKey,
    model: patch.model ?? base.model,
    timeoutMs: patch.timeoutMs ?? base.timeoutMs,
  });
}

/**
 * 可热切换的 AI 适配器：包装当前实例，配置保存后调用 refresh() 立即生效，无需重启。
 * 无界面配置时回落 env；两者皆无 key 时回落 Mock（零配置可跑）。
 */
export class ConfigurableAIProvider implements AIAdapter {
  private current: AIAdapter;
  private currentConfig: AiConfig | null;

  constructor(
    readonly db: Db,
    private readonly env: AiEnvDefaults,
    initialConfig: AiConfig | null,
  ) {
    this.currentConfig = initialConfig;
    this.current = instantiateAdapter(initialConfig, env);
  }

  get config(): AiConfig | null {
    return this.currentConfig;
  }

  get name(): string {
    return this.current.name;
  }

  isReady(): boolean {
    return this.current.isReady();
  }

  complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    return this.current.complete(request);
  }

  /** 保存（含清空）后调用：立即切换底层适配器 */
  refresh(config: AiConfig | null): void {
    this.currentConfig = config;
    this.current = instantiateAdapter(config, this.env);
  }

  /** 应用表单补丁：合并→落库→热切换，返回新视图（重启后仍生效） */
  async applyPatch(patch: AiConfigPatch, updatedBy: string | null): Promise<AiConfigView> {
    const config = mergeAiConfig(patch, this.currentConfig, this.env);
    await writeAiConfigToDb(this.db, config, updatedBy);
    this.refresh(config);
    return this.describe();
  }

  /** 用表单补丁构造临时适配器（不落库、不切换），供"测试连接" */
  probePatch(patch: AiConfigPatch): AIAdapter | null {
    const config = mergeAiConfig(patch, this.currentConfig, this.env);
    if (!config) return null;
    return new OpenAICompatProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      name: 'ai-config-test',
      timeoutMs: Math.min(config.timeoutMs, 20_000),
    });
  }

  /** 对外视图：来源 + 掩码，不含明文 key */
  describe(): AiConfigView {
    const effective = this.currentConfig ?? envDefaultsToConfig(this.env);
    const source: AiConfigView['source'] = this.currentConfig ? 'db' : effective ? 'env' : 'mock';
    return {
      source,
      baseUrl: effective?.baseUrl ?? DEFAULT_BASE_URL,
      model: effective?.model ?? DEFAULT_MODEL,
      timeoutMs: effective?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      hasKey: Boolean(effective?.apiKey),
      keyMasked: effective ? maskKey(effective.apiKey) : null,
    };
  }
}

export { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS };
