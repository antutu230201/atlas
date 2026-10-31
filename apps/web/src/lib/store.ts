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
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeSlug: null,
      setActiveSlug: (slug) => set({ activeSlug: slug }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    { name: 'atlas-ui' },
  ),
);
