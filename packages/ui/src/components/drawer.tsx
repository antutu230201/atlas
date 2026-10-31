'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ComponentPropsWithRef } from 'react';
import { XIcon } from '../icons';
import { cn } from '../cn';

export const Drawer = RadixDialog.Root;
export const DrawerTrigger = RadixDialog.Trigger;
export const DrawerClose = RadixDialog.Close;

/** 侧滑抽屉：基于 Dialog 的 side 变体（移动端导航 / 详情面板） */
export function DrawerContent({
  side = 'left',
  className,
  children,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixDialog.Content> & { side?: 'left' | 'right' }) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/40" />
      <RadixDialog.Content
        ref={ref}
        className={cn(
          'fixed top-0 z-[var(--z-modal)] h-full w-72 border-border bg-surface p-5 shadow-lg focus-visible:outline-none',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          className,
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close
          aria-label="关闭"
          className="absolute right-3 top-3 rounded-sm p-1 text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <XIcon />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DrawerHeader({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('mb-4', className)} {...props} />;
}

export function DrawerTitle({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixDialog.Title>) {
  return (
    <RadixDialog.Title
      ref={ref}
      className={cn('text-base font-semibold text-text', className)}
      {...props}
    />
  );
}

export function DrawerBody({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('text-sm text-text', className)} {...props} />;
}
