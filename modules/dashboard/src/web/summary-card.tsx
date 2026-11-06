'use client';

import { Skeleton } from '@atlas/ui';
import type { SourceEnvelope, DailySummary } from './types';
import { ScreenIcon } from './icons';

/**
 * AI 每日摘要卡：服务端按天缓存（TTL 6h / 手动强刷），此处纯展示。
 * 数据为 MockAI 模板文案时同样可读——配置真实供应商后自动升级（阶段 5 遗留项）。
 */
export function SummaryCard({ envelope }: { envelope: SourceEnvelope<DailySummary> }) {
  // Mock 供应商会把完整提示词回显到正文；大屏只展示诚实的预览说明，不把调试文本当 AI 产出。
  const isMock = envelope.payload?.text.startsWith('[MockAI]') ?? false;
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
            <p className="screen-label mt-0.5 !text-[9px]">Atlas intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-primary-soft px-2.5 py-1 text-[9px] text-primary">
          <span className="size-1 animate-pulse rounded-full bg-primary" />
          {isMock ? 'PREVIEW · 待接入' : 'AI BRIEFING'}
        </div>
      </div>

      <div className="relative mt-4 border-l border-primary/30 pl-4">
        {envelope.payload ? (
          <>
            {isMock ? (
              <div className="py-1">
                <p className="text-[13px] leading-6 font-medium text-text/90">
                  今天也辛苦了。先把手边最要紧的一件事做好，剩下的按自己的节奏来。
                </p>
                <p className="mt-1 text-[10px] leading-5 text-muted">
                  当前为本地预览文案；配置真实 AI 供应商后，会自动结合天气、待办与打卡生成每日小结。
                </p>
              </div>
            ) : (
              <p className="text-[13px] leading-7 text-text/90">{envelope.payload.text}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted">
                {isMock ? '预览模式 · 不消耗 AI 配额' : '从今天的天气、进度与节奏里，提炼给你。'}
              </p>
              {envelope.fetchedAt ? (
                <span className="shrink-0 font-mono text-[9px] text-muted">
                  {new Date(envelope.fetchedAt).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  {isMock ? '更新' : '生成'}
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
