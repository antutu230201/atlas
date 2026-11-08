'use client';

import { lazy, type ComponentType } from 'react';

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
  sample_note: {
    list: lazy(() =>
      import('@atlas/module-sample-note/web').then((module) => ({
        default: module.SampleNoteListPage,
      })),
    ),
  },
  todo_notes: {
    list: lazy(() =>
      import('@atlas/module-todo-notes/web').then((module) => ({ default: module.TodoListPage })),
    ),
    trash: lazy(() =>
      import('@atlas/module-todo-notes/web').then((module) => ({ default: module.TodoTrashPage })),
    ),
  },
  dashboard: {
    screen: lazy(() =>
      import('@atlas/module-dashboard/web/screen').then((module) => ({
        default: module.DashboardScreenPage,
      })),
    ),
    listening: lazy(() =>
      import('@atlas/module-dashboard/web/listening').then((module) => ({
        default: module.ListeningStatsPage,
      })),
    ),
  },
  habits: {
    today: lazy(() =>
      import('@atlas/module-habits/web').then((module) => ({ default: module.HabitsTodayPage })),
    ),
  },
};

export const moduleWidgetRegistry: Record<
  string,
  Record<string, ComponentType<ModulePageProps>>
> = {
  todo_notes: {
    TodayWidget: lazy(() =>
      import('@atlas/module-todo-notes/web').then((module) => ({
        default: module.TodoTodayWidget,
      })),
    ),
  },
};

/** 全局悬浮层：模块启用即挂载，跨页面/刷新常驻（播放器等需要"全局存在感"的能力） */
export const moduleOverlayRegistry: Record<string, ComponentType<ModulePageProps>> = {
  dashboard: lazy(() =>
    import('@atlas/module-dashboard/web/music-player').then((module) => ({
      default: module.FloatingMusicPlayer,
    })),
  ),
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
