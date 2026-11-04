'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HotItem, SourceEnvelope } from './types';
import { HealthDot, TagChip } from './icons';

export function formatHeat(heat?: number): string | undefined {
  if (heat === undefined || Number.isNaN(heat)) return undefined;
  if (heat >= 100_000_000) return `${(heat / 100_000_000).toFixed(1)}亿`;
  if (heat >= 10_000) return `${Math.round(heat / 10_000)}万`;
  return String(heat);
}

/** 与上一次快照对比的排名变化：↑升 ↓降 ＝持平 · 新上榜 */
function useRankChanges(items: HotItem[]): Map<string, number> {
  const prevRef = useRef<Map<string, number>>(new Map());
  const [changes, setChanges] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map<string, number>();
    for (const item of items) {
      const old = prev.get(item.title);
      next.set(item.title, old === undefined ? 0 : old - item.rank);
      prev.set(item.title, item.rank);
    }
    // 清理已下榜标题，防止长驻内存
    if (prev.size > 200) prevRef.current = new Map([...prev].slice(-100));
    setChanges(next);
  }, [items]);
  return changes;
}

/** 单个热榜源卡片：排名徽章 + 标题直达 + 热度 + 排名变化 */
export function HotlistCard({
  label,
  envelope,
  limit = 10,
}: {
  label: string;
  envelope: SourceEnvelope<HotItem[]>;
  limit?: number;
}) {
  // useMemo 稳定 items 引用：否则 slice 每次渲染产生新数组，useRankChanges 的 effect 会无限重跑
  const items = useMemo(() => (envelope.payload ?? []).slice(0, limit), [envelope.payload, limit]);
  const changes = useRankChanges(items);

  const fetchedText = envelope.fetchedAt
    ? new Date(envelope.fetchedAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="glass flex h-full flex-col rounded-md p-4">
      <header className="mb-2 flex items-center gap-2">
        <HealthDot status={envelope.status} />
        <h3 className="text-sm font-semibold">{label}</h3>
        {fetchedText ? <span className="text-[10px] text-muted">{fetchedText}</span> : null}
        {envelope.status === 'stale' || envelope.status === 'error' ? (
          <span className="ml-auto text-[10px] text-warn" role="status">
            {envelope.status === 'stale' ? '缓存' : '失效'}
          </span>
        ) : null}
      </header>

      {envelope.payload === null ? (
        <p className="py-4 text-center text-xs text-muted">
          {envelope.status === 'empty' ? '该源未启用' : (envelope.error ?? '暂无数据')}
        </p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">源返回了空列表</p>
      ) : (
        <ol className="space-y-1">
          {items.map((item) => {
            const change = changes.get(item.title);
            const changeMark =
              change === undefined ? null : change > 0 ? (
                <span className="text-err">↑</span>
              ) : change < 0 ? (
                <span className="text-ok">↓</span>
              ) : (
                <span className="text-muted">＝</span>
              );
            const top = item.rank <= 3;
            const body = (
              <>
                <span
                  className={`w-5 shrink-0 text-center font-mono text-xs font-semibold ${
                    top ? 'text-err' : 'text-muted'
                  }`}
                >
                  {item.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{item.title}</span>
                {item.tag ? <TagChip tag={item.tag} /> : null}
                {changeMark ? (
                  <span className="w-3 shrink-0 text-[10px]">{changeMark}</span>
                ) : (
                  <span className="w-3" />
                )}
                {formatHeat(item.heat) ? (
                  <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted">
                    {formatHeat(item.heat)}
                  </span>
                ) : null}
              </>
            );
            return (
              <li key={`${item.rank}-${item.title}`}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.5 rounded-xs px-1 py-1 transition-colors hover:bg-surface-hover"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-xs px-1 py-1">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
