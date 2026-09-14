import * as React from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface Props {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Size override (e.g. compact calendar rows); defaults to 18px */
  className?: string;
}

export function TaskCheckbox({ checked, onToggle, disabled, className }: Props) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={t('task:markComplete')}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border transition-all duration-200 active:scale-90',
        checked
          ? 'border-primary bg-primary text-primary-foreground checkbox-pop'
          : 'border-muted-foreground/40 text-transparent hover:border-primary',
        disabled && 'opacity-50',
        className ?? 'h-[18px] w-[18px]',
      )}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}