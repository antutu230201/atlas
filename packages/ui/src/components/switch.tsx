'use client';

import * as RadixSwitch from '@radix-ui/react-switch';
import { cn } from '../cn';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function Switch({ className, ...props }: SwitchProps & { className?: string }) {
  return (
    <RadixSwitch.Root
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border transition-colors duration-[var(--duration-base)]',
        'data-[state=checked]:bg-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-4.5 translate-x-1 rounded-full bg-surface shadow-soft transition-transform duration-[var(--duration-base)] data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
}
