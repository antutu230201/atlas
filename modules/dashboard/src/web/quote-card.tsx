'use client';

import type { Quote, SourceEnvelope } from './types';

/** 一言卡：横向满宽 + 右侧元信息列，纵向随左栏拉伸，避免短句留下大片空白 */
export function QuoteCard({ envelope }: { envelope: SourceEnvelope<Quote> }) {
  const quote = envelope.payload;
  if (!quote) return null;
  return (
    <figure
      className="screen-card screen-reveal flex flex-1 items-stretch gap-4 p-4 md:gap-5 md:p-5"
      style={{ '--screen-index': 4 } as React.CSSProperties}
    >
      <span
        aria-hidden
        className="shrink-0 select-none self-center font-serif text-4xl leading-none text-primary/30 md:text-5xl"
      >
        「
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <blockquote className="text-[13px] leading-6 text-text/90 md:text-sm md:leading-7">
          {quote.text}」
        </blockquote>
        <figcaption className="mt-2 flex items-center gap-2 text-[10px] text-muted">
          <span className="h-px w-5 bg-border" />
          {quote.author ? <span>{quote.author}</span> : null}
          {quote.from ? <span>《{quote.from}》</span> : null}
        </figcaption>
      </div>
      <div className="hidden shrink-0 flex-col items-end justify-between border-l border-border pl-4 sm:flex">
        <span className="screen-label !text-[9px]">Daily quote</span>
        <span className="font-mono text-[9px] tracking-wider text-muted">HITOKOTO</span>
      </div>
    </figure>
  );
}
