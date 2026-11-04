'use client';

import type { Quote, SourceEnvelope } from './types';

/** 一言卡：每日金句（hitokoto） */
export function QuoteCard({ envelope }: { envelope: SourceEnvelope<Quote> }) {
  const quote = envelope.payload;
  if (!quote) return null;
  return (
    <figure className="glass rounded-md p-4">
      <blockquote className="text-sm leading-relaxed">「{quote.text}」</blockquote>
      <figcaption className="mt-2 text-xs text-muted">
        {quote.author ? `—— ${quote.author}` : ''}
        {quote.from ? <span className="ml-1">《{quote.from}》</span> : ''}
      </figcaption>
    </figure>
  );
}
