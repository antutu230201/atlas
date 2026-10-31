'use client';

import Link from 'next/link';
import { useActiveWorkspace } from '@/hooks/use-workspace';
import { useEnabledModules } from '@/lib/queries';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function TodayPage() {
  const { workspace } = useActiveWorkspace();
  const modules = useEnabledModules(workspace?.slug ?? null);
  const enabled = modules.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-[0.2em] text-muted">今天</p>
        <h1 className="text-2xl font-semibold">{greeting()}</h1>
        <p className="text-sm text-muted">
          {workspace ? `当前在「${workspace.name}」` : '先创建或选择一个工作空间'}
        </p>
      </header>

      {workspace && enabled.length === 0 ? (
        <section className="rounded-md border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold">启用第一个模块，开始使用 Atlas</p>
          <p className="mt-2 text-xs text-muted">
            到工作空间设置的「模块」页启用示例笔记，即可体验模块全链路。
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
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-widest text-muted">模块入口</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enabled.map((m) =>
              m.routes.map((route) => (
                <Link
                  key={`${m.name}/${route.path}`}
                  href={`/m/${m.name}/${route.path}`}
                  className="rounded-md border border-border bg-surface p-4 shadow-soft transition-shadow hover:shadow-md"
                >
                  <p className="text-sm font-semibold">{route.title}</p>
                  <p className="mt-1 text-xs text-muted">{m.title}</p>
                </Link>
              )),
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
