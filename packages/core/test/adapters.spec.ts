import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InMemoryCacheAdapter } from '../src/cache';
import { InMemoryQueueAdapter } from '../src/queue';
import { LocalDiskStorageAdapter, storageKey } from '../src/storage';

describe('InMemoryCacheAdapter', () => {
  it('写入后可读取，未设置 TTL 则不过期', async () => {
    const cache = new InMemoryCacheAdapter();
    await cache.set('k1', { a: 1 });
    await expect(cache.get<{ a: number }>('k1')).resolves.toEqual({ a: 1 });
  });

  it('TTL 过期后读取返回 undefined', async () => {
    const cache = new InMemoryCacheAdapter();
    await cache.set('k2', 'v', { ttlMs: 20 });
    await expect(cache.get('k2')).resolves.toBe('v');
    await new Promise((r) => setTimeout(r, 60));
    await expect(cache.get('k2')).resolves.toBeUndefined();
  });

  it('delete 与 clear 生效', async () => {
    const cache = new InMemoryCacheAdapter();
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.delete('a');
    await expect(cache.get('a')).resolves.toBeUndefined();
    await cache.clear();
    await expect(cache.get('b')).resolves.toBeUndefined();
  });
});

describe('InMemoryQueueAdapter', () => {
  it('任务按延迟投递并被处理器消费', async () => {
    const queue = new InMemoryQueueAdapter();
    const received: string[] = [];
    queue.process<string>('greet', async (job) => {
      received.push(job.payload);
    });
    await queue.enqueue('greet', 'hello', { delayMs: 50 });
    await new Promise((r) => setTimeout(r, 400));
    expect(received).toEqual(['hello']);
    await expect(queue.stats()).resolves.toEqual({ pending: 0, completed: 1, deadLetter: 0 });
  });

  it('失败任务按重试次数重试，耗尽进入死信', async () => {
    const queue = new InMemoryQueueAdapter();
    let attempts = 0;
    queue.process('flaky', async () => {
      attempts += 1;
      throw new Error('boom');
    });
    await queue.enqueue('flaky', null, { maxAttempts: 2 });
    await new Promise((r) => setTimeout(r, 2000));
    expect(attempts).toBe(2);
    await expect(queue.stats()).resolves.toEqual({ pending: 0, completed: 0, deadLetter: 1 });
  });

  it('未注册处理器的任务不会被丢弃', async () => {
    const queue = new InMemoryQueueAdapter();
    await queue.enqueue('orphan', 'x');
    await new Promise((r) => setTimeout(r, 300));
    const stats = await queue.stats();
    expect(stats.pending).toBe(1);
  });
});

describe('LocalDiskStorageAdapter', () => {
  const baseDir = join(tmpdir(), `atlas-storage-test-${process.pid}-${Date.now()}`);

  async function cleanup(): Promise<void> {
    await rm(baseDir, { recursive: true, force: true });
  }

  it('put / exists / get / delete 往返一致', async () => {
    const storage = new LocalDiskStorageAdapter(baseDir);
    try {
      await storage.ping();
      const data = new TextEncoder().encode('你好，Atlas');
      const key = storageKey('notes', '2026', 'hello.txt');
      await storage.put(key, data);
      await expect(storage.exists(key)).resolves.toBe(true);
      const roundTrip = await storage.get(key);
      expect(new TextDecoder().decode(roundTrip)).toBe('你好，Atlas');
      await storage.delete(key);
      await expect(storage.exists(key)).resolves.toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('拒绝路径穿越与非法 key', async () => {
    const storage = new LocalDiskStorageAdapter(baseDir);
    try {
      await expect(storage.put('../escape.txt', new Uint8Array())).rejects.toThrow(/非法|越界/);
      await expect(storage.put('a\nb', new Uint8Array())).rejects.toThrow(/非法/);
    } finally {
      await cleanup();
    }
  });
});
