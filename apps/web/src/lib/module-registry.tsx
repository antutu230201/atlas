'use client';

import type { ComponentType } from 'react';
import { SampleNoteListPage } from '@atlas/module-sample-note/web';

/**
 * 模块前端注册表（装配点，ADR-0005 §7）：
 * 新增带界面的模块时，在此登记一行 —— 页面经 /m/<module>/<route> 动态挂载。
 * 后端动作不需要登记（走 /v1/modules/.../call 网关）。
 */

export interface ModulePageProps {
  workspaceSlug: string;
  moduleName: string;
}

export const moduleWebRegistry: Record<string, Record<string, ComponentType<ModulePageProps>>> = {
  sample_note: { list: SampleNoteListPage },
};

export function getModulePage(
  moduleName: string,
  routePath: string,
): ComponentType<ModulePageProps> | undefined {
  return moduleWebRegistry[moduleName]?.[routePath];
}
