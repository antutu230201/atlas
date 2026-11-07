'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 顶栏副标轮播：把"工作空间 / AI 小结首句 / 连续打卡 / 天气"轮流显示在同一行，
 * 首屏不额外占高度，但一眼能看到今天最值得看的那句话。悬停暂停，点击可看全文。
 */
export function ScreenHeadline({ items }: { items: string[] }) {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  // 条目变化时回到第一条，避免索引越界
  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      if (!paused.current) setIndex((current) => (current + 1) % items.length);
    }, 9_000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  const text = items[index] ?? '';

  return (
    <p
      className="screen-label mt-0.5 flex min-w-0 items-center gap-1.5 truncate !text-[11px]"
      onMouseEnter={() => {
        paused.current = true;
      }}
      onMouseLeave={() => {
        paused.current = false;
      }}
      title={text}
    >
      <span className="screen-headline-fade truncate" key={index}>
        {text}
      </span>
      {items.length > 1 ? (
        <span className="flex shrink-0 items-center gap-1" aria-hidden>
          {items.map((item, dot) => (
            <span
              key={item}
              className={`size-1 rounded-full transition-colors ${dot === index ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </span>
      ) : null}
    </p>
  );
}
