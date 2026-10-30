import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface EmptyStateProps {
  /** 顶部插图或图标（ReactNode） */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** 主行动区（按钮等） */
  action?: ReactNode;
  className?: string;
}

/** 空状态：每个空列表都必须有设计过的引导，不允许裸白屏 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-1 text-muted">{icon}</div> : null}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description ? (
        <p className="max-w-80 text-xs leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
