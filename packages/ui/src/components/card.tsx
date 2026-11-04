import type { ComponentPropsWithRef } from 'react';
import { cn } from '../cn';

export function Card({
  className,
  variant = 'solid',
  ref,
  ...props
}: ComponentPropsWithRef<'div'> & { variant?: 'solid' | 'glass' }) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--radius-md)] p-5 transition-all duration-[var(--duration-base)]',
        variant === 'glass'
          ? 'glass border-white/30 shadow-soft'
          : 'border border-border bg-surface shadow-soft',
        'hover:shadow-md',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: ComponentPropsWithRef<'h3'>) {
  return <h3 className={cn('text-base font-semibold text-text', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentPropsWithRef<'p'>) {
  return <p className={cn('mt-1 text-sm leading-relaxed text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('text-sm text-text', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('mt-4 flex items-center gap-2', className)} {...props} />;
}
