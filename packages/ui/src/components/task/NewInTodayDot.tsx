import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

/**
 * New in Today 黄点——参考 Things 3 的 new in Today 圆点：上次查看 Today
 * 之后随日期到来进入 Today 的条目，在行首左侧留白处标一个小黄点。
 * 由所在行定位（行需 relative）。
 */
export function NewInTodayDot({ className }: Props) {
  return (
    <span
      data-testid="new-in-today-dot"
      aria-hidden
      className={cn(
        'pointer-events-none absolute left-0 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-today',
        className,
      )}
    />
  );
}
