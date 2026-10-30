/**
 * 依赖注入令牌与常量。
 * 非 class 依赖（env、db、探针组合）用 Symbol 令牌走 useFactory，避免元数据歧义。
 */

/** 与 apps/api/package.json 的 version 保持同步；阶段 8 换为构建注入 */
export const API_VERSION = '0.1.0';

export const ENV_TOKEN = Symbol('API_ENV');
export const DB_TOKEN = Symbol('DB');
export const PROBES_TOKEN = Symbol('HEALTH_PROBES');
