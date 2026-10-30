import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { HealthProbe } from './health';

export interface StorageAdapter extends HealthProbe {
  /** 写入对象；key 允许用 "/" 分层（如 covers/2026/a.png） */
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;

  /** 读取对象；不存在时 reject */
  get(key: string): Promise<Uint8Array>;

  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** key 白名单：字母数字开头，允许 . _ / -，防止路径穿越与控制字符 */
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,511}$/;

/**
 * 本地磁盘存储实现，顶替 S3 / MinIO（ADR-0002）。
 * 目录布局与对象存储一致（扁平 key + 分层前缀），未来换 S3 驱动时数据可平移。
 */
export class LocalDiskStorageAdapter implements StorageAdapter {
  readonly name = 'storage';

  constructor(private readonly baseDir: string) {}

  async ping(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await stat(this.baseDir);
  }

  async put(key: string, data: Uint8Array, _contentType?: string): Promise<void> {
    // _contentType 在本地实现中暂不持久化；S3 实现时作为对象元数据写入
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async get(key: string): Promise<Uint8Array> {
    const target = this.pathFor(key);
    return readFile(target);
  }

  async delete(key: string): Promise<void> {
    const target = this.pathFor(key);
    await rm(target, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const target = this.pathFor(key);
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  }

  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`非法的存储 key："${key}"`);
    }
    const target = resolve(this.baseDir, key);
    const root = resolve(this.baseDir) + sep;
    if (!target.startsWith(root)) {
      throw new Error(`存储 key 越界："${key}"`);
    }
    return target;
  }
}

/** 便捷拼接：把分段 key 规范化为 "a/b/c" 形式 */
export function storageKey(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .filter((s) => s.length > 0)
    .join('/');
}
