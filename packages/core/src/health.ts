/**
 * 基础设施健康探测协议。
 *
 * 所有适配器（进程内置换实现或未来的 Redis / MinIO / 云实现）都必须实现该接口，
 * 供 /v1/health 等运维入口统一探测。换适配器不影响健康检查链路。
 */
export interface HealthProbe {
  /** 组件名，同时也是健康报告里的服务键名，如 "queue" */
  readonly name: string;

  /** 探活：正常则 resolve；异常则 reject 并附带原因 */
  ping(): Promise<void>;
}
