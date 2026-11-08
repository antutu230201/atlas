import type { ComponentPropsWithRef } from 'react';
import { cn } from '../cn';

/** 表格样式基元：语义结构由调用方组织（thead/tbody），虚拟滚动在阶段 4 引入 */

export function Table({
  className,
  ref,
  'aria-label': ariaLabel,
  ...props
}: ComponentPropsWithRef<'table'>) {
  return (
    // 横向滚动容器必须是可聚焦区域，否则键盘用户无法滚到右侧列（WCAG 2.1.1）
    <div
      className="w-full overflow-x-auto rounded-md border border-border bg-surface"
      tabIndex={0}
      role="region"
      aria-label={ariaLabel ? `${ariaLabel}（可横向滚动）` : '表格（可横向滚动）'}
    >
      <table
        ref={ref}
        aria-label={ariaLabel}
        className={cn('w-full border-collapse text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function THead({ className, ...props }: ComponentPropsWithRef<'thead'>) {
  return <thead className={cn('bg-surface', className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentPropsWithRef<'tbody'>) {
  return <tbody className={className} {...props} />;
}

export function TR({
  className,
  selected,
  ...props
}: ComponentPropsWithRef<'tr'> & { selected?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        'border-b border-border transition-colors duration-[var(--duration-fast)] last:border-0',
        'hover:bg-surface-hover',
        'data-[selected]:bg-primary-soft',
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, ...props }: ComponentPropsWithRef<'th'>) {
  return (
    <th
      className={cn('px-3 py-2.5 text-left text-xs font-semibold text-muted', className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: ComponentPropsWithRef<'td'>) {
  return <td className={cn('px-3 py-2.5 text-text', className)} {...props} />;
}
