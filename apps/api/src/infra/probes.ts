import { resolve } from 'node:path';
import type { HealthProbe } from '@atlas/core';
import { InMemoryCacheAdapter, InMemoryQueueAdapter, LocalDiskStorageAdapter } from '@atlas/core';
import type { ApiEnv } from '../env';

/**
 * 阶段 0 的基础设施适配器组合（ADR-0002）：
 * 队列与缓存用进程内实现，存储用本地磁盘实现。
 * 将来切换 Redis / BullMQ / S3 时只改这个函数，业务代码零改动。
 */
export function buildProbes(env: ApiEnv): HealthProbe[] {
  const storageBaseDir = resolve(process.cwd(), env.STORAGE_DIR);
  return [
    new InMemoryQueueAdapter(),
    new InMemoryCacheAdapter(),
    new LocalDiskStorageAdapter(storageBaseDir),
  ];
}
