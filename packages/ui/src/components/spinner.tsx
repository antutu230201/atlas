import { cn } from '../cn';

/** 加载指示器：跟随文字颜色（current），大小由调用方控制 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="加载中"
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        'size-4',
        className,
      )}
    />
  );
}
