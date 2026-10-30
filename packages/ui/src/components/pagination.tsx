'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { cn } from '../cn';

export interface PaginationProps {
  /** 当前页（从 1 开始） */
  page: number;
  /** 总页数 */
  total: number;
  onChange: (page: number) => void;
  className?: string;
}

/** 紧凑分页：上一页 / 页码文本 / 下一页 */
export function Pagination({ page, total, onChange, className }: PaginationProps) {
  const canPrev = page > 1;
  const canNext = page < total;
  return (
    <nav
      aria-label="分页"
      className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}
    >
      <button
        type="button"
        aria-label="上一页"
        disabled={!canPrev}
        onClick={() => onChange(page - 1)}
        className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-text transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeftIcon />
      </button>
      <span aria-current="page">
        第 {page} / {total} 页
      </span>
      <button
        type="button"
        aria-label="下一页"
        disabled={!canNext}
        onClick={() => onChange(page + 1)}
        className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-text transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronRightIcon />
      </button>
    </nav>
  );
}
