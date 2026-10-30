import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Bucket {
  hits: number[];
}

/**
 * 进程内滑动窗口限流（登录/注册防爆破，ADR-0005 §5）。
 * 单实例开发足够；多实例部署时换 Redis 适配器（接口不变）。
 */
@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  /** 超出限额抛 429；正常则记录本次并返回剩余次数 */
  check(key: string, limit = 10, windowMs = 60_000): number {
    this.ensureCleanup(windowMs);
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);
    if (bucket.hits.length >= limit) {
      const oldest = bucket.hits[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      throw new HttpException(
        { error: 'atlas.auth.rate-limited', message: `尝试过于频繁，请 ${retryAfterSec} 秒后再试` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return limit - bucket.hits.length;
  }

  private ensureCleanup(windowMs: number): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets) {
        bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);
        if (bucket.hits.length === 0) this.buckets.delete(key);
      }
    }, 60_000);
    this.cleanupTimer.unref?.();
  }
}
