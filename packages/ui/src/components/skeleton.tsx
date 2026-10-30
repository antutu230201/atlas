import { cn } from '../cn';

/** 骨架屏：内容加载前的占位，比转圈更稳 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-sm bg-border', className)} />;
}
