'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ComponentPropsWithRef } from 'react';
import { XIcon } from '../icons';
import { cn } from '../cn';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  className,
  children,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixDialog.Content>) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/40" />
      <RadixDialog.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[min(440px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-surface p-6 shadow-lg',
          'focus-visible:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close
          aria-label="关闭"
          className="absolute right-4 top-4 rounded-sm p-1 text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <XIcon />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('mb-4', className)} {...props} />;
}

export function DialogTitle({
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

export function DialogDescription({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixDialog.Description>) {
  return (
    <RadixDialog.Description
      ref={ref}
      className={cn('mt-1 text-sm leading-relaxed text-muted', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />;
}
