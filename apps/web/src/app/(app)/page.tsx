'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@atlas/ui';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useEnabledModules } from '@/lib/queries';
import { DashboardScreenPage } from '@atlas/module-dashboard/web';
import { getModuleWidget } from '@/lib/module-registry';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function TodayPage() {
  const { workspace, user } = useActiveWorkspace();
  const modules = useEnabledModules(workspace?.slug ?? null);
  const queryClient = useQueryClient();
  const enabled = modules.data ?? [];
  const now = new Date();
  const dateStr = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${WEEKDAYS[now.getDay()]}`;

  // 大屏是产品主屏（产品定位，见 roadmap 2026-11-07）：启用 dashboard 模块的工作空间，
  // 根路径直接渲染个人大屏，注册/登录落地即大屏；旧"今天"页保留为未启用模块时的引导页。
  if (
    workspace &&
    !modules.isPending &&
    !modules.isError &&
    enabled.some((m) => m.name === 'dashboard')
  ) {
    return <DashboardScreenPage workspaceSlug={workspace.slug} moduleName="dashboard" />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium tracking-[0.2em] text-muted">今天</p>
          <span className="text-xs text-muted/60">{dateStr}</span>
        </div>
        <h1 className="text-2xl font-semibold">
          {greeting()}
          {user ? `，${user.displayName}` : ''}
        </h1>
        <p className="text-sm text-muted">
          {workspace ? `当前在「${workspace.name}」` : '先创建或选择一个工作空间'}
        </p>
      </header>

      {workspace && modules.isError ? (
        <section className="rounded-md border border-err/30 bg-err-soft p-8 text-center">
          <p className="text-sm font-semibold text-err">模块状态加载失败</p>
          <p className="mt-2 text-xs text-muted">请确认服务是否正常，然后重试。</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-4"
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ['module-status', workspace.slug] })
            }
          >
            重试
          </Button>
        </section>
      ) : null}

      {workspace && modules.isPending ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-widest text-muted">小组件</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1].map((index) => (
              <div key={index} className="h-32 animate-pulse rounded-md bg-surface-hover" />
            ))}
          </div>
        </section>
      ) : null}

      {workspace && !modules.isPending && !modules.isError && enabled.length === 0 ? (
        <section className="rounded-md border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold">启用第一个模块，开始使用 Atlas</p>
          <p className="mt-2 text-xs text-muted">
            到工作空间设置的「模块」页启用，即可体验模块全链路。
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-block rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            前往设置
          </Link>
        </section>
      ) : null}

      {enabled.length > 0 ? (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-semibold tracking-widest text-muted">小组件</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {enabled.map((module) =>
                module.widgets?.map((widget) => {
                  const Widget = getModuleWidget(module.name, widget.component);
                  if (!Widget || !workspace) return null;
                  return (
                    <Widget
                      key={`${module.name}/${widget.id}`}
                      workspaceSlug={workspace.slug}
                      moduleName={module.name}
                    />
                  );
                }),
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold tracking-widest text-muted">模块入口</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {enabled.flatMap((m) =>
                m.routes.map((route) => (
                  <Link
                    key={`${m.name}/${route.path}`}
                    href={`/m/${m.name}/${route.path}`}
                    className="group rounded-md border border-border bg-surface p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <p className="text-sm font-semibold text-text transition-colors group-hover:text-primary">
                      {route.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">{m.title}</p>
                  </Link>
                )),
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
