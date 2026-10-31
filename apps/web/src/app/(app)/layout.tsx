'use client';

import { AppShell } from '@/components/app-shell';

/** 登录后的应用外壳：未登录自动跳转 /login（AppShell 内处理） */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
