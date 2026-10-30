'use client';

import * as RadixSelect from '@radix-ui/react-select';
import type { ComponentPropsWithRef } from 'react';
import { CheckIcon, ChevronDownIcon } from '../icons';
import { cn } from '../cn';

export const Select = RadixSelect.Root;
export const SelectValue = RadixSelect.Value;

export function SelectTrigger({
  className,
  children,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixSelect.Trigger>) {
  return (
    <RadixSelect.Trigger
      ref={ref}
      className={cn(
        'inline-flex h-10 min-w-40 items-center justify-between gap-2 rounded-sm border border-border bg-surface px-3 text-sm text-text',
        'transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[placeholder]:text-muted',
        className,
      )}
      {...props}
    >
      {children}
      <RadixSelect.Icon>
        <ChevronDownIcon className="text-muted" />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixSelect.Content>) {
  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        ref={ref}
        position="popper"
        sideOffset={6}
        className={cn(
          'z-[var(--z-dropdown)] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-md',
          className,
        )}
        {...props}
      >
        <RadixSelect.Viewport>{children}</RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixSelect.Item>) {
  return (
    <RadixSelect.Item
      ref={ref}
      className={cn(
        'flex cursor-pointer select-none items-center justify-between gap-2 rounded-xs px-2.5 py-2 text-sm text-text outline-none',
        'data-[highlighted]:bg-surface-hover data-[state=checked]:font-semibold',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator>
        <CheckIcon width={14} height={14} className="text-primary" />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
}
