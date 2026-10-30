'use client';

import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../cn';

export const DropdownMenu = RadixDropdownMenu.Root;
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger;

export function DropdownMenuContent({
  className,
  children,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixDropdownMenu.Content>) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        ref={ref}
        sideOffset={6}
        className={cn(
          'z-[var(--z-dropdown)] min-w-44 rounded-md border border-border bg-surface p-1 shadow-md',
          className,
        )}
        {...props}
      >
        {children}
      </RadixDropdownMenu.Content>
    </RadixDropdownMenu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixDropdownMenu.Item>) {
  return (
    <RadixDropdownMenu.Item
      ref={ref}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-xs px-2.5 py-2 text-sm text-text outline-none',
        'data-[highlighted]:bg-surface-hover',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixDropdownMenu.Label>) {
  return (
    <RadixDropdownMenu.Label
      className={cn('px-2.5 py-1.5 text-xs font-medium text-muted', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixDropdownMenu.Separator>) {
  return (
    <RadixDropdownMenu.Separator className={cn('my-1 h-px bg-border', className)} {...props} />
  );
}
