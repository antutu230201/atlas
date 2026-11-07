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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 关注词高亮：只做子串匹配（不区分大小写），命中部分用主色标出 */
function renderTitle(title: string, watchWords: string[]): React.ReactNode {
  const hits = watchWords.filter(
    (word) => word.length > 0 && title.toLowerCase().includes(word.toLowerCase()),
  );
  if (hits.length === 0) return title;
  const lowerHits = new Set(hits.map((word) => word.toLowerCase()));
  const pattern = new RegExp(`(${hits.map(escapeRegExp).join('|')})`, 'gi');
  return title.split(pattern).map((part, index) =>
    lowerHits.has(part.toLowerCase()) ? (
      <mark key={`${part}-${index}`} className="rounded-[2px] bg-primary-soft px-0.5 text-primary">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

/** 与上一次快照对比的排名变化：↑升 ↓降 ＝持平 · 新上榜 */ function useRankChanges(
  items: HotItem[],
): Map<string, number> {
  const prevRef = useRef<Map<string, number>>(new Map());
  const [changes, setChanges] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map<string, number>();
    items.forEach((item, index) => {
      const old = prev.get(item.title);
      // 用列表位置而不是接口 rank：微博 realpos 会出现重复/跳号，位置才是真实名次
      next.set(item.title, old === undefined ? 0 : old - index);
      prev.set(item.title, index);
    });
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
  sourceKey,
  index = 0,
  watchWords = [],
}: {
  label: string;
  envelope: SourceEnvelope<HotItem[]>;
  limit?: number;
  sourceKey?: string;
  index?: number;
  /** 关注词：命中的标题高亮 */
  watchWords?: string[];
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

  const sourceTone = {
    weibo: { mark: '微', tone: 'bg-warn-soft text-warn' },
    douyin: { mark: '抖', tone: 'bg-info-soft text-info' },
    bilibili: { mark: 'B', tone: 'bg-primary-soft text-primary' },
    baidu: { mark: '百', tone: 'bg-info-soft text-info' },
    toutiao: { mark: '头', tone: 'bg-ok-soft text-ok' },
  }[sourceKey ?? ''] ?? { mark: label.slice(0, 1), tone: 'bg-primary-soft text-primary' };

  return (
    <article
      className="screen-card screen-reveal group/card flex h-full flex-col hover:-translate-y-1"
      style={{ '--screen-index': index + 3 } as React.CSSProperties}
    >
      <header className="flex items-center gap-3 border-b border-border px-3 py-2.5">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] font-bold ${sourceTone.tone}`}
        >
          {sourceTone.mark}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold tracking-tight">{label}</h3>
          <p className="screen-label mt-0.5 !text-[10px]">Trending now</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <HealthDot status={envelope.status} />
          {envelope.status === 'stale' || envelope.status === 'error' ? (
            <span className="text-warn" role="status">
              {envelope.status === 'stale' ? '缓存' : '失效'}
            </span>
          ) : (
            <span>{fetchedText ?? 'LIVE'}</span>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col px-2 py-1">
        {envelope.payload === null ? (
          <p className="my-auto py-8 text-center text-xs text-muted">
            {envelope.status === 'empty' ? '该源未启用' : (envelope.error ?? '暂无数据')}
          </p>
        ) : items.length === 0 ? (
          <p className="my-auto py-8 text-center text-xs text-muted">源返回了空列表</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border/40">
            {items.map((item, index) => {
              // 显示名次一律用位置，保证 1..N 连续（接口的 rank 可能重复）
              const rank = index + 1;
              const change = changes.get(item.title);
              const changeMark =
                change === undefined || change === 0 ? null : change > 0 ? (
                  <span className="text-[10px] leading-none text-err">↑{change}</span>
                ) : (
                  <span className="text-[10px] leading-none text-ok">↓{-change}</span>
                );
              const rankTone =
                rank === 1
                  ? 'text-err'
                  : rank === 2
                    ? 'text-warn'
                    : rank === 3
                      ? 'text-warn/80'
                      : 'text-muted/70';
              const heat = formatHeat(item.heat);
              const body = (
                <>
                  <span className="flex w-5 shrink-0 flex-col items-center gap-0.5">
                    <span
                      className={`font-mono text-[13px] font-semibold leading-none tabular-nums ${rankTone}`}
                    >
                      {rank}
                    </span>
                    {changeMark}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span
                      className="truncate text-[13px] leading-normal text-text"
                      title={item.title}
                    >
                      {renderTitle(item.title, watchWords)}
                    </span>
                    {item.tag ? <TagChip tag={item.tag} /> : null}
                  </span>
                  <span className="w-11 shrink-0 text-right font-mono text-[12px] leading-none tabular-nums text-muted">
                    {heat ?? <span className="text-muted/30">—</span>}
                  </span>
                </>
              );
              return (
                <li key={`${item.rank}-${item.title}`}>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group flex h-8 items-center gap-3 rounded-sm px-1.5 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="group flex h-8 items-center gap-3 rounded-sm px-1.5">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </article>
  );
}
