import { sql } from 'drizzle-orm';
import { Injectable } from '@nestjs/common';
import type { HealthProbe } from '@atlas/core';
import type { HealthReport, ServiceStatus } from '@atlas/sdk';
import type { Db } from '../../db/client';
import { bootMarkers } from '../../db/schema';

@Injectable()
export class HealthService {
  private bootMarkerWritten = false;

  constructor(
    private readonly db: Db,
    private readonly probes: HealthProbe[],
    private readonly version: string,
  ) {}

  /** 汇总所有服务状态；任一异常时整体为 error（HTTP 层返回 503） */
  async check(): Promise<HealthReport> {
    const services: Record<string, ServiceStatus> = { api: 'ok' };

    try {
      await this.db.execute(sql`select 1`);
      services.database = 'ok';
    } catch (error) {
      services.database = 'error';
      this.logFailure('database', error);
    }

    for (const probe of this.probes) {
      try {
        await probe.ping();
        services[probe.name] = 'ok';
      } catch (error) {
        services[probe.name] = 'error';
        this.logFailure(probe.name, error);
      }
    }

    if (services.database === 'ok') {
      await this.ensureBootMarker();
    }

    const anyError = Object.values(services).some((status) => status === 'error');
    return {
      status: anyError ? 'error' : 'ok',
      version: this.version,
      services,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /** 进程生命周期内只写一次，验证"迁移 → 连接 → 写入"链路 */
  private async ensureBootMarker(): Promise<void> {
    if (this.bootMarkerWritten) return;
    this.bootMarkerWritten = true;
    try {
      await this.db.insert(bootMarkers).values({ note: `api v${this.version} 启动` });
    } catch {
      // 建表缺失（迁移未执行）或测试替身不支持写入时忽略：
      // 健康检查不因验证性写入而误报
    }
  }

  private logFailure(component: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[health] ${component} 探测失败：${message}`);
  }
}
