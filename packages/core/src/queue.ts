import type { HealthProbe } from './health';

export interface QueueJobOptions {
  /** 最大尝试次数（含首次），耗尽后进入死信。默认 3 */
  maxAttempts?: number;

  /** 延迟投递的毫秒数。默认 0（立即） */
  delayMs?: number;
}

export interface QueueJob<T = unknown> {
  id: string;
  name: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
}

export interface QueueStats {
  pending: number;
  completed: number;
  deadLetter: number;
}

export type QueueHandler<T = unknown> = (job: QueueJob<T>) => Promise<void>;

/**
 * 队列适配器。阶段 0 用进程内实现顶替 Redis + BullMQ（ADR-0002）；
 * 接口保持不变，后续替换实现时业务代码零改动。
 */
export interface QueueAdapter extends HealthProbe {
  /** 投递任务，返回任务 id */
  enqueue<T>(name: string, payload: T, options?: QueueJobOptions): Promise<string>;

  /** 注册某类任务的处理函数（同名覆盖） */
  process<T>(name: string, handler: QueueHandler<T>): void;

  /** 队列运行统计 */
  stats(): Promise<QueueStats>;
}

interface InternalJob {
  id: string;
  name: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  runAt: number;
}

const TICK_INTERVAL_MS = 100;
const RETRY_BACKOFF_BASE_MS = 500;
const ORPHAN_RETRY_MS = 1000;

/**
 * 进程内最小可用队列：延迟投递、失败重试（退避）、死信计数。
 * 不做持久化 —— 持久化语义由未来的 PG outbox / BullMQ 实现承担。
 */
export class InMemoryQueueAdapter implements QueueAdapter {
  readonly name = 'queue';

  private readonly jobs: InternalJob[] = [];
  private readonly handlers = new Map<string, QueueHandler<never>>();
  private completed = 0;
  private deadLetter = 0;
  private seq = 0;
  private timer: NodeJS.Timeout | null = null;

  async ping(): Promise<void> {
    // 进程内实现与调用方同生命周期，天然可用
  }

  async enqueue<T>(name: string, payload: T, options: QueueJobOptions = {}): Promise<string> {
    const job: InternalJob = {
      id: `job_${++this.seq}`,
      name,
      payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      runAt: Date.now() + (options.delayMs ?? 0),
    };
    this.jobs.push(job);
    this.ensureTicker();
    return job.id;
  }

  process<T>(name: string, handler: QueueHandler<T>): void {
    this.handlers.set(name, handler as QueueHandler<never>);
    this.ensureTicker();
  }

  async stats(): Promise<QueueStats> {
    return {
      pending: this.jobs.length,
      completed: this.completed,
      deadLetter: this.deadLetter,
    };
  }

  private ensureTicker(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    // 空转的定时器不应阻止进程退出
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const index = this.jobs.findIndex((job) => job.runAt <= now);
    if (index === -1) return;

    const job = this.jobs.splice(index, 1)[0];
    if (!job) return;

    const handler = this.handlers.get(job.name);
    if (!handler) {
      // 处理器尚未注册：留回队列稍后重试，等待注册后消化
      job.runAt = now + ORPHAN_RETRY_MS;
      this.jobs.push(job);
      return;
    }

    job.attempts += 1;
    try {
      await (handler as QueueHandler<unknown>)(job as QueueJob<unknown>);
      this.completed += 1;
    } catch {
      if (job.attempts >= job.maxAttempts) {
        this.deadLetter += 1;
      } else {
        job.runAt = now + RETRY_BACKOFF_BASE_MS * job.attempts;
        this.jobs.push(job);
      }
    }
  }
}
