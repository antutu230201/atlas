import { Slot } from '@radix-ui/react-slot';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-soft',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-hover',
  ghost: 'bg-transparent text-primary hover:bg-primary-soft',
  danger: 'bg-err text-on-err hover:opacity-90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

const interactive =
  'inline-flex items-center justify-center gap-2 rounded-sm font-semibold whitespace-nowrap ' +
  'transition-colors duration-[var(--duration-fast)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
  'disabled:pointer-events-none disabled:opacity-50';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 点击后展示加载态并禁用 */
  loading?: boolean;
  /** 以子元素为渲染目标（Radix Slot），用于把按钮样式套在链接等元素上 */
  asChild?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  asChild = false,
  disabled,
  children,
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      data-loading={loading || undefined}
      className={cn(interactive, variantClasses[variant], sizeClasses[size], className)}
      disabled={asChild ? undefined : disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </Comp>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'size'> {
  size?: 'sm' | 'md';
  /** 无文字按钮必须提供可访问名称 */
  'aria-label': string;
}

export function IconButton({
  className,
  variant = 'secondary',
  size = 'md',
  ref,
  ...props
}: IconButtonProps) {
  return (
    <Button
      ref={ref}
      variant={variant}
      className={cn(size === 'sm' ? 'size-8 p-0' : 'size-10 p-0', className)}
      {...props}
    />
  );
}
