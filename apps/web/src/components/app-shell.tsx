'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ThemeToggle,
  ToastProvider,
  cn,
} from '@atlas/ui';
import { getModuleOverlay } from '@/lib/module-registry';
import { NotificationBell } from './notification-bell';
import { useEnabledModules, useLogout, useSession } from '@/lib/queries';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useUiStore } from '@/lib/store';
import { CommandPalette } from './command-palette';

/**
 * 应用外壳（阶段 3）：侧边导航（工作空间切换 + 已启用模块动态生成）+ 顶栏。
 * 桌面固定侧栏、移动端经抽屉展开；导航项完全由启用模块的 manifest 驱动。
 */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { workspace } = useActiveWorkspace();
  const modules = useEnabledModules(workspace?.slug ?? null);

  const item = (href: string, label: string, active: boolean, icon?: string) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors duration-[var(--duration-fast)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active
          ? 'bg-primary-soft font-semibold text-primary'
          : 'text-muted hover:bg-surface-hover hover:text-text',
      )}
    >
      {icon ? <span className="w-4 text-center text-xs">{icon}</span> : null}
      {label}
    </Link>
  );

  const moduleRoutes = (modules.data ?? []).flatMap((m) =>
    m.routes.map((route) => ({
      href: `/m/${m.name}/${route.path}`,
      label: route.title,
      key: `${m.name}/${route.path}`,
    })),
  );

  return (
    <nav aria-label="主导航" className="space-y-1">
      {item('/', '今天', pathname === '/', '☀')}
      <p className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-widest text-muted">模块</p>
      {modules.isError ? (
        <p className="px-3 text-xs text-err">模块状态加载失败，请稍后重试。</p>
      ) : moduleRoutes.length === 0 ? (
        <p className="px-3 text-xs text-muted">尚无已启用模块，可在设置中启用。</p>
      ) : (
        moduleRoutes.map((route) => item(route.href, route.label, pathname === route.href))
      )}
      <p className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-widest text-muted">更多</p>
      {item('/assistant', 'AI 助手', pathname === '/assistant', '✦')}
      {workspace ? item('/settings', '设置', pathname === '/settings', '⚙') : null}
      {item('/notifications', '通知', pathname === '/notifications', '✉')}
    </nav>
  );
}

function ShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggle = useUiStore((state) => state.toggleSidebar);
  const chromeHidden = useUiStore((state) => state.chromeHidden);
  const session = useSession();
  const router = useRouter();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const { workspace } = useActiveWorkspace();
  const modules = useEnabledModules(workspace?.slug ?? null);
  // 大屏主导（产品定位，ADR-0008）：根路径渲染 dashboard 大屏时内容全宽（去内边距），
  // 但保留 Shell 顶栏 —— 用户菜单/通知等系统级操作必须始终可达，也避免顶栏随模块
  // 查询结果挂载/卸载抖动。/m/dashboard/screen（完整形态）与 listening（自绘氛围）
  // 隐藏顶栏。
  const onDashboardHome =
    pathname === '/' && (modules.data ?? []).some((mod) => mod.name === 'dashboard');
  const isImmersiveScreen = /^\/m\/dashboard\/screen\/?$/.test(pathname);
  const isListeningPage = /^\/m\/dashboard\/listening\/?$/.test(pathname);
  const fullBleed = isImmersiveScreen || onDashboardHome || isListeningPage;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* 全局氛围背景：大屏同款天空渐变 + 网格（低强度，所有 Shell 页面共享） */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="screen-sky opacity-60" />
        <div className="screen-grid absolute inset-0 opacity-30" />
      </div>
      {/* chromeHidden：沉浸模式（大屏全屏），侧栏/顶栏/抽屉隐藏，命令面板仍可用 */}
      {!chromeHidden ? (
        <aside
          className={cn(
            'glass-strong hidden shrink-0 flex-col gap-6 p-4 pb-6 transition-[width] duration-[var(--duration-base)] md:sticky md:top-0 md:flex md:h-dvh md:self-start md:overflow-y-auto',
            collapsed ? 'w-16' : 'w-64',
          )}
        >
          <div className="flex items-center justify-between">
            {!collapsed ? (
              <Link href="/" className="text-sm font-bold tracking-widest text-primary">
                ATLAS
              </Link>
            ) : (
              <span className="text-sm font-bold text-primary">A</span>
            )}
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? '展开导航' : '折叠导航'}
              className="rounded-sm p-1 text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {collapsed ? '»' : '«'}
            </button>
          </div>
          <div className={cn(collapsed && 'hidden')}>
            <SidebarNav />
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {!chromeHidden && !isImmersiveScreen ? (
          <header className="glass sticky top-0 z-[var(--z-sticky)] flex h-14 items-center justify-between gap-3 px-4 md:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-sm border border-border p-1.5 text-muted md:hidden"
                aria-label="打开导航"
                onClick={() => setMobileOpen(true)}
              >
                ☰
              </button>
              <span className="hidden text-sm text-muted md:inline">{workspace?.name ?? ''}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="打开命令面板"
                className="hidden items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:inline-flex"
              >
                <span>搜索</span>
                <kbd className="rounded-xs bg-surface-hover px-1 text-[10px]">Ctrl+K</kbd>
              </button>
              <ThemeToggle />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="用户菜单"
                    className="inline-flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
                  >
                    {(session.data?.user.displayName ?? '？').slice(0, 1)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{session.data?.user.email ?? ''}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      void logout.mutateAsync().then(() => {
                        queryClient.clear();
                        router.replace('/login');
                      });
                    }}
                  >
                    登出
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
        ) : null}

        <main className={cn('min-w-0 flex-1', !chromeHidden && !fullBleed && 'p-4 md:p-8')}>
          {children}
        </main>
      </div>

      {!chromeHidden ? (
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
          <DrawerContent className="p-4">
            <DrawerHeader>
              <DrawerTitle className="text-sm font-bold tracking-widest text-primary">
                ATLAS
              </DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      ) : null}

      {/* 模块全局悬浮层（如音乐播放器）：跨页面常驻，模块启用即挂载；
          沉浸模式（挂墙）也保留，大屏需要音乐控制 */}
      {workspace
        ? (modules.data ?? []).map((mod) => {
            const Overlay = getModuleOverlay(mod.name);
            return Overlay ? (
              <Overlay
                key={`${mod.name}-overlay`}
                workspaceSlug={workspace.slug}
                moduleName={mod.name}
              />
            ) : null;
          })
        : null}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.isError) router.replace('/login');
  }, [session.isError, router]);

  if (session.isLoading || session.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg" aria-busy="true">
        <div className="w-64 space-y-4">
          <div className="h-5 w-24 animate-pulse rounded bg-surface-hover" />
          <div className="h-32 animate-pulse rounded-md bg-surface-hover" />
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <ShellBody>{children}</ShellBody>
    </ToastProvider>
  );
}
