import type { HealthProbe } from '@atlas/core';
import { describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client';
import { HealthService } from '../src/modules/health/health.service';

function probe(name: string, ok = true): HealthProbe {
  return {
    name,
    ping: ok
      ? async () => undefined
      : async () => {
          throw new Error(`${name} 不可用`);
        },
  };
}

function fakeDb(failSelect = false): Db {
  return {
    execute: failSelect
      ? async () => {
          throw new Error('连接失败');
        }
      : async () => ({}),
  } as unknown as Db;
}

describe('HealthService', () => {
  it('全部正常时返回 ok，HTTP 层应为 200', async () => {
    const service = new HealthService(fakeDb(), [probe('queue'), probe('storage')], '0.0.0-test');
    const report = await service.check();
    expect(report.status).toBe('ok');
    expect(report.services).toMatchObject({
      api: 'ok',
      database: 'ok',
      queue: 'ok',
      storage: 'ok',
    });
    expect(report.version).toBe('0.0.0-test');
    expect(typeof report.uptimeSeconds).toBe('number');
  });

  it('数据库失败时整体为 error，其余服务不受影响', async () => {
    const service = new HealthService(fakeDb(true), [probe('queue')], '0.0.0-test');
    const report = await service.check();
    expect(report.status).toBe('error');
    expect(report.services.database).toBe('error');
    expect(report.services.queue).toBe('ok');
    expect(report.services.api).toBe('ok');
  });

  it('探针异常标记为 error 并计入整体状态', async () => {
    const service = new HealthService(fakeDb(), [probe('queue', false)], '0.0.0-test');
    const report = await service.check();
    expect(report.services.queue).toBe('error');
    expect(report.services.database).toBe('ok');
    expect(report.status).toBe('error');
  });

  it('数据库不可用时跳过启动标记写入（不误报）', async () => {
    const service = new HealthService(fakeDb(true), [], '0.0.0-test');
    const report = await service.check();
    // 假库没有 insert 能力；若代码在数据库失败时仍尝试写入会抛出未被捕获的错误
    expect(report.services.database).toBe('error');
  });
});
