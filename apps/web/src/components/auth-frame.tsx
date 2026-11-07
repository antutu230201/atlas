import type { ReactNode } from 'react';

/**
 * 登录/注册共用的大屏氛围框架：天空渐变 + 网格 + 柔化遮罩（与个人大屏同一视觉体系）。
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 text-text">
      <div className="screen-sky" aria-hidden />
      <div className="screen-grid absolute inset-0" aria-hidden />
      <div className="absolute inset-0" style={{ background: 'var(--screen-scrim)' }} aria-hidden />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </main>
  );
}
