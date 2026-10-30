import { Suspense } from 'react';
import type { HealthReport, ServiceStatus } from '@atlas/sdk';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const SERVICE_LABELS: Record<string, string> = {
  api: 'API 服务',
  database: '数据库',
  queue: '任务队列',
  cache: '缓存',
  storage: '文件存储',
};

/** 健康检查在每次请求时实时拉取，禁止构建期预渲染（否则构建机会去连 API） */
export const dynamic = 'force-dynamic';

async function fetchHealth(): Promise<HealthReport> {
  const response = await fetch(`${API_URL}/v1/health`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`健康检查返回 ${response.status}`);
  }
  return (await response.json()) as HealthReport;
}

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-[0.2em] text-zinc-400">
          ATLAS · 阶段 0 工程基线
        </p>
        <h1 className="text-3xl font-semibold">个人成长系统</h1>
        <p className="text-zinc-500">
          平台内核 + 可插拔模块。当前是脚手架验收页：确认一条命令能把全部服务跑起来。
        </p>
      </header>

      <Suspense fallback={<HealthSkeleton />}>
        <HealthPanel />
      </Suspense>

      <footer className="space-y-1 text-sm text-zinc-400">
        <p>下一步：在 docs/design/visual-directions.html 选定视觉方向，然后建立设计系统。</p>
        <p>阶段规划见 docs/roadmap.md。</p>
      </footer>
    </main>
  );
}

async function HealthPanel() {
  let report: HealthReport;
  try {
    report = await fetchHealth();
  } catch {
    return <HealthError />;
  }

  const allOk = report.status === 'ok';
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-medium">系统健康状态</h2>
        <StatusBadge status={report.status} label={allOk ? '全部正常' : '存在异常'} />
      </div>

      <ul className="divide-y divide-zinc-100">
        {Object.entries(report.services).map(([name, status]) => (
          <li key={name} className="flex items-center justify-between py-3">
            <span>{SERVICE_LABELS[name] ?? name}</span>
            <StatusBadge status={status} label={status === 'ok' ? '正常' : '异常'} />
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-zinc-400">
        数据来自 GET {API_URL}/v1/health · v{report.version} · 进程已运行 {report.uptimeSeconds} 秒
      </p>
    </section>
  );
}

function StatusBadge({ status, label }: { status: ServiceStatus; label: string }) {
  const className =
    status === 'ok'
      ? 'rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700'
      : 'rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700';
  return <span className={className}>{label}</span>;
}

function HealthSkeleton() {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm" aria-busy="true">
      <div className="mb-6 h-5 w-32 animate-pulse rounded bg-zinc-200" />
      <div className="space-y-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-14 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-zinc-400">正在连接 API…</p>
    </section>
  );
}

function HealthError() {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-medium text-red-800">暂时无法连接 API 服务</h2>
      <p className="mt-2 text-sm text-red-700">
        这通常说明 apps/api 没有随 pnpm dev 一起启动，或数据库仍在初始化（首次启动约需十几秒）。
        请在仓库根目录运行 <code className="rounded bg-red-100 px-1">pnpm dev</code> 后刷新本页。
      </p>
      <p className="mt-3 text-xs text-red-500">
        若问题持续，查看 API 日志或访问 {API_URL}/v1/health 确认服务状态。
      </p>
    </section>
  );
}
