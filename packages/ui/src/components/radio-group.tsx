'use client';

import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { CircleIcon } from '../icons';
import { cn } from '../cn';

export const RadioGroup = RadixRadioGroup.Root;

export interface RadioProps {
  value: string;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export function Radio({ value, label, disabled, id }: RadioProps) {
  const radio = (
    <RadixRadioGroup.Item
      value={value}
      id={id}
      disabled={disabled}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface transition-colors duration-[var(--duration-fast)]',
        'data-[state=checked]:border-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <RadixRadioGroup.Indicator className="flex items-center justify-center">
        <CircleIcon
          width={10}
          height={10}
          fill="currentColor"
          stroke="none"
          className="text-primary"
        />
      </RadixRadioGroup.Indicator>
    </RadixRadioGroup.Item>
  );

  if (!label) return radio;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text" htmlFor={id}>
      {radio}
      {label}
    </label>
  );
}
