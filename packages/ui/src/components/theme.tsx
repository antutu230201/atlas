'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyTheme, readTheme, THEME_STORAGE_KEY, type ThemePreference } from '@atlas/tokens';
import { cn } from '../cn';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * 主题三态提供者：light / dark / system（跟随系统）。
 * 首屏防闪烁由 @atlas/tokens 的 THEME_INIT_SCRIPT 负责，这里只管运行时切换。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    setPreferenceState(readTheme());
  }, []);

  // system 偏好下监听系统切换，实时换肤
  useEffect(() => {
    if (preference !== 'system') return;
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme('system');
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference: (next) => {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // 存储不可用（隐私模式等）时仅本次会话生效
        }
        applyTheme(next);
        setPreferenceState(next);
      },
    }),
    [preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme 必须在 <ThemeProvider> 内使用');
  }
  return context;
}

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: '亮' },
  { value: 'dark', label: '暗' },
  { value: 'system', label: '跟随' },
];

/** 三段式主题切换器 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="主题"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm border border-border bg-surface p-0.5',
        className,
      )}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={preference === option.value}
          onClick={() => setPreference(option.value)}
          className={cn(
            'rounded-xs px-2 py-1 text-xs font-medium transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            preference === option.value
              ? 'bg-primary text-on-primary'
              : 'text-muted hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
