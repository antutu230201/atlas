import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { parseManifest, type ModuleDefinition, type ModuleManifest } from '@atlas/sdk';

export interface LoadedModule {
  /** npm 包名，如 @atlas/module-sample-note */
  packageName: string;
  definition: ModuleDefinition;
  /** 模块迁移目录（包内，随源码提交） */
  migrationsPath: string;
}

/**
 * 模块发现服务（ADR-0005 §7 实现记录）：
 * 扫描 apps/api/package.json 依赖中的 @atlas/module-* 并动态 import 其 definition。
 * 新增模块 = 新增依赖 + 数据库启用，内核代码零改动。
 * 模块迁移目录经 require.resolve(<pkg>/package.json) 定位（pnpm workspace 符号链接）。
 */
@Injectable()
export class ModuleRegistryService {
  private cache: Promise<Map<string, LoadedModule>> | null = null;

  /** 首次调用时发现并缓存；失败不缓存（模块包修复/构建完成后下次调用自动重试） */
  async loaded(): Promise<Map<string, LoadedModule>> {
    this.cache ??= this.discover().catch((error: unknown) => {
      this.cache = null;
      throw error;
    });
    return this.cache;
  }

  async all(): Promise<LoadedModule[]> {
    return [...(await this.loaded()).values()];
  }

  async get(name: string): Promise<LoadedModule | undefined> {
    return (await this.loaded()).get(name);
  }

  private async discover(): Promise<Map<string, LoadedModule>> {
    const map = new Map<string, LoadedModule>();
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const packageNames = Object.keys(pkg.dependencies ?? {}).filter((d) =>
      d.startsWith('@atlas/module-'),
    );
    for (const packageName of packageNames) {
      const mod = (await import(packageName)) as { definition?: unknown };
      const definition = this.parseDefinition(mod, packageName);
      // 主入口（dist/index.js）上溯两级到包根 —— 不依赖 exports 是否放行 package.json
      const entryPath = require.resolve(packageName);
      const pkgDir = path.dirname(path.dirname(entryPath));
      map.set(definition.manifest.name, {
        packageName,
        definition,
        migrationsPath: path.join(pkgDir, definition.manifest.migrations),
      });
    }
    return map;
  }

  private parseDefinition(mod: { definition?: unknown }, packageName: string): ModuleDefinition {
    const raw = mod?.definition;
    if (!raw || typeof raw !== 'object') {
      throw new Error(`模块包 ${packageName} 未导出 definition`);
    }
    const candidate = raw as {
      manifest?: unknown;
      actions?: Record<string, { permission?: unknown; handler?: unknown }>;
    };
    const manifest: ModuleManifest = parseManifest(candidate.manifest);
    const actions: ModuleDefinition['actions'] = {};
    for (const [action, value] of Object.entries(candidate.actions ?? {})) {
      if (!value || typeof value.permission !== 'string' || typeof value.handler !== 'function') {
        throw new Error(`模块 ${manifest.name} 的 action "${action}" 缺少 permission 或 handler`);
      }
      actions[action] = {
        permission: value.permission,
        handler: value.handler as ModuleDefinition['actions'][string]['handler'],
      };
    }
    return { manifest, actions };
  }
}
