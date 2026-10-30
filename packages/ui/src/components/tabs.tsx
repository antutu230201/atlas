'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../cn';

export const Tabs = RadixTabs.Root;

export function TabsList({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      ref={ref}
      className={cn(
        'rounded-xs px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-[var(--duration-fast)]',
        'hover:text-text',
        'data-[state=active]:bg-primary data-[state=active]:text-on-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      ref={ref}
      className={cn('mt-4 text-sm text-text focus-visible:outline-none', className)}
      {...props}
    />
  );
}
