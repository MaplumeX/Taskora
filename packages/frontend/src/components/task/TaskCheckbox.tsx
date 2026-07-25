import * as React from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Props {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function TaskCheckbox({ checked, onToggle, disabled }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-200',
        checked
          ? 'border-primary bg-primary text-primary-foreground checkbox-pop'
          : 'border-muted-foreground/40 text-transparent hover:border-primary',
        disabled && 'opacity-50',
      )}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}