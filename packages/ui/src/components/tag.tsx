import type { ReactNode } from 'react';
import { XIcon } from '../icons';
import { cn } from '../cn';

export type BadgeVariant = 'neutral' | 'primary' | 'ok' | 'warn' | 'err' | 'info';

/** 显式映射，保证 Tailwind 能静态扫描到全部类名（neutral 用深字保证对比度） */
const badgeClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-border text-text',
  primary: 'bg-primary-soft text-primary',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  err: 'bg-err-soft text-err',
  info: 'bg-info-soft text-info',
};

export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        badgeClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface TagProps {
  variant?: BadgeVariant;
  onRemove?: () => void;
  className?: string;
  children: ReactNode;
}

/** 可移除的标签 */
export function Tag({ variant = 'primary', onRemove, className, children }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        badgeClasses[variant],
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="移除标签"
          className="-mr-0.5 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <XIcon width={10} height={10} />
        </button>
      ) : null}
    </span>
  );
}
