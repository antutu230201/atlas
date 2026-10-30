/**
 * 平台对外契约类型。
 *
 * 规则：这个包只放"内核 ↔ 模块 / 前端 ↔ 后端"共享的类型契约，
 * 禁止放任何业务逻辑。模块协议的完整类型在阶段 2 随内核一起落地。
 */

export type ServiceStatus = 'ok' | 'error';

/** GET /v1/health 的响应结构 */
export interface HealthReport {
  /** 全部服务正常为 ok，任一异常为 error（此时 HTTP 503） */
  status: ServiceStatus;
  /** API 版本，与 apps/api/package.json 同步 */
  version: string;
  /** 各服务状态，键为 api / database / queue / storage */
  services: Record<string, ServiceStatus>;
  /** 服务端 ISO 时间戳 */
  timestamp: string;
  /** 进程运行秒数 */
  uptimeSeconds: number;
}
