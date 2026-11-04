'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
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
import { api } from '@/lib/api';
import { useEnabledModules, useLogout, useSession } from '@/lib/queries';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useUiStore } from '@/lib/store';
import { CommandPalette } from './command-palette';

/**
 * 应用外壳（阶段 3）：侧边导航（工作空间切换 + 已启用模块动态生成）+ 顶栏。
 * 桌面固定侧栏、移动端经抽屉展开；导航项完全由启用模块的 manifest 驱动。
 */

function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { workspaces, workspace } = useActiveWorkspace();
  const setActiveSlug = useUiStore((state) => state.setActiveSlug);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (workspaces.isLoading) {
    return (
      <div className={cn('h-9 animate-pulse rounded-sm bg-surface-hover', compact && 'hidden')} />
    );
  }

  const list = workspaces.data ?? [];

  return (
    <div className={cn('space-y-2', compact && 'hidden')}>
      {list.length === 0 ? (
        <p className="text-xs text-muted">还没有工作空间，先创建一个。</p>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-sm border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="truncate">{workspace?.name ?? '选择工作空间'}</span>
              <span aria-hidden className="text-muted">
                ⌄
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>切换工作空间</DropdownMenuLabel>
            {list.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => {
                  setActiveSlug(w.slug);
                  queryClient.invalidateQueries({ queryKey: ['modules'] });
                }}
              >
                <span className="flex-1">{w.name}</span>
                <span className="text-xs text-muted">{w.role}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {creating ? (
        <div className="space-y-2 rounded-sm border border-border bg-surface p-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="工作空间名称"
            aria-label="工作空间名称"
            className="h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          {error ? <p className="text-xs text-err">{error}</p> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              loading={pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  const created = await api<{ slug: string }>('/workspaces', {
                    method: 'POST',
                    json: { name },
                  });
                  await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
                  setActiveSlug(created.slug);
                  setCreating(false);
                  setName('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : '创建失败');
                } finally {
                  setPending(false);
                }
              }}
            >
              创建
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full rounded-sm px-3 py-1.5 text-left text-xs text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          + 新建工作空间
        </button>
      )}
    </div>
  );
}

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
      {moduleRoutes.length === 0 ? (
        <p className="px-3 text-xs text-muted">尚无已启用模块，可在设置中启用。</p>
      ) : (
        moduleRoutes.map((route) => item(route.href, route.label, pathname === route.href))
      )}
      <p className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-widest text-muted">
        工作空间
      </p>
      {item('/assistant', 'AI 助手', pathname === '/assistant', '✦')}
      {workspace ? item('/settings', '设置', pathname === '/settings', '⚙') : null}
      {item('/notifications', '通知', pathname === '/notifications', '✉')}
    </nav>
  );
}

function ShellBody({ children }: { children: React.ReactNode }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggle = useUiStore((state) => state.toggleSidebar);
  const session = useSession();
  const router = useRouter();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const { workspace } = useActiveWorkspace();
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
      <aside
        className={cn(
          'glass-strong hidden shrink-0 flex-col gap-6 border-r border-white/20 p-4 transition-[width] duration-[var(--duration-base)] md:flex',
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
        <WorkspaceSwitcher compact={collapsed} />
        <div className={cn(collapsed && 'hidden')}>
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-[var(--z-sticky)] flex h-14 items-center justify-between gap-3 border-b border-white/20 px-4 md:px-6">
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
            <Link
              href="/notifications"
              className="rounded-sm px-2 py-1 text-sm text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              通知
            </Link>
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

        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>

      <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
        <DrawerContent className="p-4">
          <DrawerHeader>
            <DrawerTitle className="text-sm font-bold tracking-widest text-primary">
              ATLAS
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <WorkspaceSwitcher />
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

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
