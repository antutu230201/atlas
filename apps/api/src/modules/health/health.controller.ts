import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HEALTH_SERVICE_TOKEN } from '../../tokens';
import type { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HEALTH_SERVICE_TOKEN) private readonly healthService: HealthService) {}

  /**
   * GET /v1/health
   * 全部正常返回 200；任一服务异常返回 503（负载均衡与告警可直接使用）。
   */
  @Get()
  async check(@Res() res: Response): Promise<void> {
    const report = await this.healthService.check();
    res.status(report.status === 'ok' ? 200 : 503).json(report);
  }
}
