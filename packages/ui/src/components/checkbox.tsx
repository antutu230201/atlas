'use client';

import * as RadixCheckbox from '@radix-ui/react-checkbox';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { CheckIcon } from '../icons';
import { cn } from '../cn';

export interface CheckboxProps extends Omit<
  ComponentPropsWithRef<typeof RadixCheckbox.Root>,
  'ref'
> {
  /** 标签文字；勾选框右侧展示 */
  label?: ReactNode;
}

export function Checkbox({ className, label, id, ...props }: CheckboxProps) {
  const checkbox = (
    <RadixCheckbox.Root
      id={id}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-xs border border-border bg-surface transition-colors duration-[var(--duration-fast)]',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-on-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator>
        <CheckIcon width={12} height={12} strokeWidth={3} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );

  if (!label) return checkbox;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text" htmlFor={id}>
      {checkbox}
      {label}
    </label>
  );
}
