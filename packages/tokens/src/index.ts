/**
 * 令牌的 TS 侧定义：供主题切换逻辑、测试与文档使用。
 * 视觉值的唯一来源是同目录 tokens.css —— 这里只放结构与行为，不放颜色。
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'atlas-theme';

/** 写在 <html data-theme="..."> 上的合法取值 */
export const THEME_VALUES: ThemePreference[] = ['light', 'dark', 'system'];

/** 首屏防闪烁脚本：在 React 水合前把存储的主题写到 <html data-theme> */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var t=localStorage.getItem(k)||'system';if(['light','dark','system'].indexOf(t)<0)t='system';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

/** 把主题偏好应用到文档（运行时切换用；首屏请用 THEME_INIT_SCRIPT） */
export function applyTheme(theme: ThemePreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

/** 读取当前主题偏好（SSR 环境返回 'system'） */
export function readTheme(): ThemePreference {
  if (typeof document === 'undefined') return 'system';
  const value = document.documentElement.getAttribute('data-theme');
  return THEME_VALUES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}
