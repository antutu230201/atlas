'use client';

import { Skeleton } from '@atlas/ui';
import type { SourceEnvelope, DailySummary } from './types';

/**
 * AI 每日摘要卡：服务端按天缓存（TTL 6h / 手动强刷），此处纯展示。
 * 数据为 MockAI 模板文案时同样可读——配置真实供应商后自动升级（阶段 5 遗留项）。
 */
export function SummaryCard({ envelope }: { envelope: SourceEnvelope<DailySummary> }) {
  return (
    <div className="glass rounded-md p-5" aria-label="AI 每日小结">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-widest text-muted">✦ 每日小结</p>
        {envelope.fetchedAt ? (
          <span className="text-[10px] text-muted">
            {new Date(envelope.fetchedAt).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            生成
          </span>
        ) : null}
      </div>

      {envelope.payload ? (
        <>
          <p className="mt-3 text-sm leading-relaxed">{envelope.payload.text}</p>
          {envelope.status === 'stale' ? (
            <p className="mt-2 text-[10px] text-warn" role="status">
              展示的是上次缓存的小结（本次生成失败）
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-3 space-y-2">
          {envelope.status === 'error' ? (
            <p className="text-sm text-warn" role="alert">
              小结暂未生成{envelope.error ? `：${envelope.error}` : ''}——点右上角「刷新」重试。
            </p>
          ) : (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
