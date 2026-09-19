import * as React from 'react';
import { Check, CircleSlash } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface Props {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** 取消态（⊘）：勾选框只读展示取消标记，点击仍走 onToggle（撤销取消）。 */
  cancelled?: boolean;
  /** Size override (e.g. compact calendar rows); defaults to 18px */
  className?: string;
}

export function TaskCheckbox({ checked, onToggle, disabled, cancelled, className }: Props) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={cancelled ? t('task:markUncancelled') : t('task:markComplete')}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border transition-all duration-200 active:scale-90',
        checked
          ? 'border-primary bg-primary text-primary-foreground checkbox-pop'
          : cancelled
            ? 'border-muted-foreground/40 text-muted-foreground'
            : 'border-muted-foreground/40 text-transparent hover:border-primary',
        disabled && 'opacity-50',
        className ?? 'h-[18px] w-[18px]',
      )}
    >
      {cancelled ? (
        <CircleSlash className="h-3 w-3" strokeWidth={2.5} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} />
      )}
    </button>
  );
}
