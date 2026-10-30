import { ChevronRightIcon } from '../icons';
import { cn } from '../cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** 面包屑：最后一项为当前页（无链接，强调显示） */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="面包屑" className={cn('flex items-center gap-1.5 text-sm', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRightIcon width={12} height={12} className="text-muted" /> : null}
            {isLast || !item.href ? (
              <span className={cn(isLast ? 'font-semibold text-text' : 'text-muted')}>
                {item.label}
              </span>
            ) : (
              <a
                href={item.href}
                className="text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {item.label}
              </a>
            )}
          </span>
        );
      })}
    </nav>
  );
}
