'use client';

import { useMemo } from 'react';
import type { HotItem, SourceEnvelope } from './types';

interface TickerEntry {
  sourceLabel: string;
  item: HotItem;
}

/**
 * 滚动头条：取各启用源的前几条拼接为横向 marquee。
 * 内容渲染两遍实现无缝循环；悬停暂停；reduced-motion 下由全局样式降级。
 */
export function Ticker({ sources }: { sources: Record<string, SourceEnvelope<HotItem[]>> }) {
  const entries = useMemo<TickerEntry[]>(() => {
    const perSource = 3;
    const result: TickerEntry[] = [];
    for (const [key, envelope] of Object.entries(sources)) {
      const label =
        { weibo: '微博', douyin: '抖音', bilibili: 'B站', baidu: '百度', toutiao: '头条' }[key] ??
        key;
      for (const item of (envelope.payload ?? []).slice(0, perSource)) {
        result.push({ sourceLabel: label, item });
      }
    }
    return result.slice(0, 15);
  }, [sources]);

  if (entries.length === 0) return null;
  const duration = Math.max(30, entries.length * 7);

  return (
    <div className="overflow-hidden" role="marquee" aria-label="滚动头条">
      <div
        className="screen-marquee flex w-max items-center gap-8"
        style={{ '--marquee-duration': `${duration}s` } as React.CSSProperties}
      >
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex items-center gap-8" aria-hidden={copy === 1}>
            {entries.map((entry, index) => (
              <li key={`${copy}-${index}`} className="flex items-center gap-2 text-xs">
                <span className="rounded-xs bg-primary-soft px-1.5 py-0.5 font-semibold text-[10px] text-primary">
                  {entry.sourceLabel}
                </span>
                {entry.item.url ? (
                  <a
                    href={entry.item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="max-w-64 truncate transition-colors hover:text-primary"
                  >
                    {entry.item.title}
                  </a>
                ) : (
                  <span className="max-w-64 truncate">{entry.item.title}</span>
                )}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
