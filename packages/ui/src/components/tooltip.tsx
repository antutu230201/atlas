'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../cn';

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export function TooltipContent({
  className,
  children,
  ref,
  ...props
}: ComponentPropsWithRef<typeof RadixTooltip.Content>) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        ref={ref}
        sideOffset={6}
        className={cn(
          'z-[var(--z-dropdown)] rounded-xs bg-text px-2.5 py-1.5 text-xs text-bg shadow-soft',
          className,
        )}
        {...props}
      >
        {children}
      </RadixTooltip.Content>
    </RadixTooltip.Portal>
  );
}
