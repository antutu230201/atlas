'use client';

import { Skeleton } from '@atlas/ui';
import type { SourceEnvelope, DailySummary } from './types';
import { ScreenIcon } from './icons';

/**
 * AI 每日摘要卡：服务端按天缓存（TTL 6h / 手动强刷），此处纯展示。
 * 数据为 MockAI 模板文案时同样可读——配置真实供应商后自动升级（阶段 5 遗留项）。
 */
export function SummaryCard({ envelope }: { envelope: SourceEnvelope<DailySummary> }) {
  return (
    <section
      className="screen-card screen-reveal bg-[linear-gradient(135deg,var(--color-primary-soft),transparent_48%)] p-5"
      aria-label="AI 每日小结"
      style={{ '--screen-index': 2 } as React.CSSProperties}
    >
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-sm border border-primary/20 bg-primary-soft text-primary">
            <ScreenIcon name="sparkles" className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">每日小结</h2>
            <p className="screen-label mt-0.5 !text-[8px]">Atlas intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-primary-soft px-2.5 py-1 text-[9px] text-primary">
          <span className="size-1 animate-pulse rounded-full bg-primary" />
          AI BRIEFING
        </div>
      </div>

      <div className="relative mt-4 border-l border-primary/30 pl-4">
        {envelope.payload ? (
          <>
            <p className="text-[13px] leading-7 text-text/90">{envelope.payload.text}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted">从今天的天气、进度与节奏里，提炼给你。</p>
              {envelope.fetchedAt ? (
                <span className="shrink-0 font-mono text-[9px] text-muted">
                  {new Date(envelope.fetchedAt).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  生成
                </span>
              ) : null}
            </div>
            {envelope.status === 'stale' ? (
              <p className="mt-2 text-[10px] text-warn" role="status">
                展示的是上次缓存的小结（本次生成失败）
              </p>
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            {envelope.status === 'error' ? (
              <p className="text-sm text-warn" role="alert">
                小结暂未生成{envelope.error ? `：${envelope.error}` : ''}——点右上角「刷新」重试。
              </p>
            ) : (
              <>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
