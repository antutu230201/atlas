'use client';

import type { ComponentType } from 'react';
import { SampleNoteListPage } from '@atlas/module-sample-note/web';
import {
  DashboardScreenPage,
  FloatingMusicPlayer,
  ListeningStatsPage,
} from '@atlas/module-dashboard/web';
import { TodoListPage, TodoTodayWidget, TodoTrashPage } from '@atlas/module-todo-notes/web';
import { HabitsTodayPage } from '@atlas/module-habits/web';

/**
 * 模块前端注册表（装配点，ADR-0005 §7）：
 * - pages：/m/<module>/<route> 动态挂载（route 对应 manifest.routes[].path）
 * - widgets：首页"今天"聚合（id 对应 manifest.widgets[].component）
 * - overlays：应用外壳挂载的全局悬浮层（跨页面常驻，如音乐播放器）
 * 新增带界面的模块时在此登记。
 */

export interface ModulePageProps {
  workspaceSlug: string;
  moduleName: string;
}

export const moduleWebRegistry: Record<string, Record<string, ComponentType<ModulePageProps>>> = {
  sample_note: { list: SampleNoteListPage },
  todo_notes: { list: TodoListPage, trash: TodoTrashPage },
  dashboard: { screen: DashboardScreenPage, listening: ListeningStatsPage },
  habits: { today: HabitsTodayPage },
};

export const moduleWidgetRegistry: Record<
  string,
  Record<string, ComponentType<ModulePageProps>>
> = {
  todo_notes: { TodayWidget: TodoTodayWidget },
};

/** 全局悬浮层：模块启用即挂载，跨页面/刷新常驻（播放器等需要"全局存在感"的能力） */
export const moduleOverlayRegistry: Record<string, ComponentType<ModulePageProps>> = {
  dashboard: FloatingMusicPlayer,
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

export function getModuleOverlay(moduleName: string): ComponentType<ModulePageProps> | undefined {
  return moduleOverlayRegistry[moduleName];
}
