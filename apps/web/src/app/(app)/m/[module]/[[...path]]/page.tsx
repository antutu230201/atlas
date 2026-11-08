'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { EmptyState, Skeleton } from '@atlas/ui';
import { getModulePage } from '@/lib/module-registry';
import { useActiveWorkspace } from '@/hooks/use-workspace';

/**
 * 模块动态挂载页：/m/<module> 与 /m/<module>/<route>
 * 页面组件来自模块前端注册表（装配点：lib/module-registry.tsx）。
 */
export default function ModulePage() {
  const params = useParams<{ module: string; path?: string }>();
  const { workspace } = useActiveWorkspace();
  const moduleName = params.module;
  const routePath = params.path ?? 'list';

  const Page = getModulePage(moduleName, routePath);

  if (!workspace) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!Page) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EmptyState
          title="页面不存在"
          description={`模块 ${moduleName} 没有名为 ${routePath} 的页面，或该模块未提供界面。`}
        />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto min-h-[60vh] max-w-5xl animate-pulse rounded-md bg-surface-hover" />
      }
    >
      <Page workspaceSlug={workspace.slug} moduleName={moduleName} />
    </Suspense>
  );
}
