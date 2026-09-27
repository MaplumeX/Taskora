import * as React from 'react';
import { X } from 'lucide-react';
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
  // 只在「未勾 → 勾上」的交互瞬间画勾；已完成任务首次渲染（如 Logbook）不播放。
  const wasChecked = React.useRef(checked);
  const animateCheck = checked && !wasChecked.current;
  React.useEffect(() => {
    wasChecked.current = checked;
  }, [checked]);
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
        // Things 3 式：14px 圆角方框、1.5px 描边、无阴影；勾上后蓝底白勾。
        'flex shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors duration-fast',
        checked || cancelled
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/50 bg-background text-transparent hover:border-primary',
        disabled && 'opacity-40',
        className ?? 'h-3.5 w-3.5',
      )}
    >
      {cancelled ? (
        <X className="h-2.5 w-2.5" strokeWidth={3.5} />
      ) : (
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className={cn('h-2.5 w-2.5', animateCheck && 'checkbox-draw')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.2 5 8.6l4.5-5.2" pathLength={1} />
        </svg>
      )}
    </button>
  );
}
