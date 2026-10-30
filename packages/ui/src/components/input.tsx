import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '../cn';

const controlBase =
  'w-full rounded-sm border bg-surface px-3 text-sm text-text placeholder:text-muted ' +
  'transition-colors duration-[var(--duration-fast)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export interface InputProps extends ComponentPropsWithRef<'input'> {
  /** 校验失败态：红色边框与光环 */
  invalid?: boolean;
}

export function Input({ className, invalid = false, ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        'h-10',
        invalid
          ? 'border-err focus-visible:ring-err/40'
          : 'border-border focus-visible:border-primary',
        className,
      )}
      {...props}
    />
  );
}

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  invalid?: boolean;
}

export function Textarea({ className, invalid = false, ref, ...props }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        'min-h-24 py-2.5 leading-relaxed',
        invalid
          ? 'border-err focus-visible:ring-err/40'
          : 'border-border focus-visible:border-primary',
        className,
      )}
      {...props}
    />
  );
}

export interface FieldProps {
  /** 与内部控件 id 一致，用于 label 关联 */
  id: string;
  label: ReactNode;
  /** 帮助文案；error 存在时被 error 覆盖 */
  hint?: ReactNode;
  /** 校验错误文案 */
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** 表单域外壳：标签 + 帮助/错误文案 + 必填标记 */
export function Field({ id, label, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-semibold text-text">
        {label}
        {required ? (
          <span className="ml-0.5 text-err" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-err">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
