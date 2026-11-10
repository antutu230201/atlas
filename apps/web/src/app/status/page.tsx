import { Suspense } from 'react';
import type { HealthReport } from '@atlas/sdk';
import { Badge, Skeleton, ThemeToggle } from '@atlas/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
// 服务端探测用绝对地址（Node fetch 不支持相对 URL）；ZCode Sites 形态由 start.sh 注入
const SERVER_API_URL = process.env.ATLAS_INTERNAL_API_URL ?? API_URL;

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
  const response = await fetch(`${SERVER_API_URL}/v1/health`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`健康检查返回 ${response.status}`);
  }
  return (await response.json()) as HealthReport;
}

export default function StatusPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-[0.2em] text-muted">ATLAS · 运维状态</p>
        <h1 className="text-3xl font-semibold">个人成长系统</h1>
        <p className="text-muted">
          平台内核 + 可插拔模块。当前页面已切换到设计令牌（晨白 Dawn），
          <a href="/login" className="text-primary hover:underline">
            进入应用 →
          </a>
        </p>
      </header>

      <Suspense fallback={<HealthSkeleton />}>
        <HealthPanel />
      </Suspense>

      <footer className="space-y-1 text-sm text-muted">
        <p>下一步：选定视觉方向后建立设计系统，再进入平台内核开发。</p>
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
    <section className="rounded-md border border-border bg-surface p-6 shadow-soft">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">系统健康状态</h2>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Badge variant={allOk ? 'ok' : 'err'}>{allOk ? '全部正常' : '存在异常'}</Badge>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {Object.entries(report.services).map(([name, status]) => (
          <li key={name} className="flex items-center justify-between py-3">
            <span>{SERVICE_LABELS[name] ?? name}</span>
            <Badge variant={status === 'ok' ? 'ok' : 'err'}>
              {status === 'ok' ? '正常' : '异常'}
            </Badge>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-muted">
        数据来自 GET {API_URL}/v1/health · v{report.version} · 进程已运行 {report.uptimeSeconds} 秒
      </p>
    </section>
  );
}

function HealthSkeleton() {
  return (
    <section
      className="rounded-md border border-border bg-surface p-6 shadow-soft"
      aria-busy="true"
    >
      <Skeleton className="mb-6 h-5 w-32" />
      <div className="space-y-4">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">正在连接 API…</p>
    </section>
  );
}

function HealthError() {
  return (
    <section className="rounded-md border border-err bg-err-soft p-6">
      <h2 className="text-lg font-medium text-err">暂时无法连接 API 服务</h2>
      <p className="mt-2 text-sm text-text">
        这通常说明 apps/api 没有随 pnpm dev 一起启动，或数据库仍在初始化（首次启动约需十几秒）。
        请在仓库根目录运行 <code className="rounded-xs bg-surface px-1">pnpm dev</code> 后刷新本页。
      </p>
      <p className="mt-3 text-xs text-muted">
        若问题持续，查看 API 日志或访问 {API_URL}/v1/health 确认服务状态。
      </p>
    </section>
  );
}
