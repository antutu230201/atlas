'use client';

import type { ComponentType } from 'react';
import { SampleNoteListPage } from '@atlas/module-sample-note/web';
import { DashboardScreenPage } from '@atlas/module-dashboard/web';
import { TodoListPage, TodoTodayWidget, TodoTrashPage } from '@atlas/module-todo-notes/web';

/**
 * 模块前端注册表（装配点，ADR-0005 §7）：
 * - pages：/m/<module>/<route> 动态挂载（route 对应 manifest.routes[].path）
 * - widgets：首页"今天"聚合（id 对应 manifest.widgets[].component）
 * 新增带界面的模块时在此登记。
 */

export interface ModulePageProps {
  workspaceSlug: string;
  moduleName: string;
}

export const moduleWebRegistry: Record<string, Record<string, ComponentType<ModulePageProps>>> = {
  sample_note: { list: SampleNoteListPage },
  todo_notes: { list: TodoListPage, trash: TodoTrashPage },
  dashboard: { screen: DashboardScreenPage },
};

export const moduleWidgetRegistry: Record<
  string,
  Record<string, ComponentType<ModulePageProps>>
> = {
  todo_notes: { TodayWidget: TodoTodayWidget },
};

export function getModulePage(
  moduleName: string,
  routePath: string,
): ComponentType<ModulePageProps> | undefined {
  return moduleWebRegistry[moduleName]?.[routePath];
}

export function getModuleWidget(
  moduleName: string,
  widgetComponent: string,
): ComponentType<ModulePageProps> | undefined {
  return moduleWidgetRegistry[moduleName]?.[widgetComponent];
}
