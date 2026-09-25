import * as React from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface Props {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** 取消态：与完成态同为实心主题色填充，仅 ✓ 换成 X；点击走 onToggle（撤销取消）。 */
  cancelled?: boolean;
  /** Size override (e.g. compact calendar rows); defaults to 14px */
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
        'flex shrink-0 items-center justify-center rounded border transition-all duration-200 active:scale-90',
        checked || cancelled
          ? 'border-primary bg-primary text-primary-foreground checkbox-pop'
          : 'border-muted-foreground/40 text-transparent hover:border-primary',
        disabled && 'opacity-50',
        className ?? 'h-3.5 w-3.5',
      )}
    >
      {cancelled ? (
        <X className="h-3 w-3" strokeWidth={3} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} />
      )}
    </button>
  );
}
