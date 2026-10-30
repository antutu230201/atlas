import type { HealthProbe } from './health';

export interface CacheSetOptions {
  /** 存活毫秒数；不传表示不过期 */
  ttlMs?: number;
}

/**
 * 缓存适配器。阶段 0 用进程内实现顶替 Redis（ADR-0002），
 * 接口与未来 Redis 实现保持一致。
 */
export interface CacheAdapter extends HealthProbe {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

export class InMemoryCacheAdapter implements CacheAdapter {
  readonly name = 'cache';

  private readonly store = new Map<string, Entry>();

  async ping(): Promise<void> {
    // 进程内实现与调用方同生命周期，天然可用
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: options.ttlMs ? Date.now() + options.ttlMs : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
