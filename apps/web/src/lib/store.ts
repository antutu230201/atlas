'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  /** 当前激活的工作空间 slug（跨刷新记忆） */
  activeSlug: string | null;
  setActiveSlug: (slug: string) => void;
  /** 侧边导航折叠（桌面） */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** 隐藏应用外壳（大屏等沉浸页面用）；非持久化，离开页面必须复位 */
  chromeHidden: boolean;
  setChromeHidden: (hidden: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeSlug: null,
      setActiveSlug: (slug) => set({ activeSlug: slug }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      chromeHidden: false,
      setChromeHidden: (hidden) => set({ chromeHidden: hidden }),
    }),
    {
      name: 'atlas-ui',
      // chromeHidden 是会话内临时态（进入沉浸页时由页面自行打开），不跨刷新
      partialize: (state) => ({
        activeSlug: state.activeSlug,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
