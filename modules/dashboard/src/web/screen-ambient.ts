'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 挂墙场景的屏幕保护（设备级偏好，存 localStorage，不入库）：
 * - 防烧屏：内容整体在 3px 范围内缓慢平移，避免静态元素在 OLED/长期点亮的面板上留下残影。
 *   位移通过 CSS 变量直写 DOM，不触发 React 重渲染（每分钟一次渲染整棵大屏树太贵）。
 * - 夜间自动压暗：22:00–07:00 叠加一层暗色，并对壁纸降亮度，减少夜间刺眼。
 */

export const ANTI_BURN_IN_KEY = 'atlas.dashboard.anti-burn-in';
export const NIGHT_MODE_KEY = 'atlas.dashboard.night-mode';

/** 夜间窗口：22 点到次日 7 点 */
export function isNightHour(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 22 || hour < 7;
}

/** 夜间自动压暗：每 5 分钟复查一次，跨过 22:00 / 07:00 时自动切换 */
export function useNightMode(enabled: boolean): boolean {
  const [night, setNight] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setNight(false);
      return;
    }
    const sync = () => setNight(isNightHour());
    sync();
    const timer = window.setInterval(sync, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return night;
}

/** 8 个方位循环，步长 1px，绕一圈回到原点：肉眼看不出，像素不会长期停在同一处 */
const SHIFT_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 1],
  [2, 0],
  [1, -1],
  [0, -2],
  [-1, -1],
  [-2, 0],
  [-1, 1],
];

export function useAntiBurnIn(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled) {
      el.style.removeProperty('--screen-shift-x');
      el.style.removeProperty('--screen-shift-y');
      return;
    }
    let index = 0;
    const tick = () => {
      const [x, y] = SHIFT_STEPS[index % SHIFT_STEPS.length] ?? [0, 0];
      index += 1;
      el.style.setProperty('--screen-shift-x', `${x}px`);
      el.style.setProperty('--screen-shift-y', `${y}px`);
    };
    tick();
    const timer = window.setInterval(tick, 90_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return ref;
}
