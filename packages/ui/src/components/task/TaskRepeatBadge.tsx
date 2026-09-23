import { Repeat } from 'lucide-react';
import type { RepeatRule } from '@taskora/shared';

import { cn } from '@/lib/utils';

interface Props {
  /** Repeat Rule；null 不渲染（recurring-tasks spec）。 */
  repeatRule: RepeatRule | null | undefined;
  className?: string;
}

/** Task 行上的重复徽标：↻ 图标（与日期/提醒徽标并排，Pattern：Reminder 时钟徽标）。 */
export function TaskRepeatBadge({ repeatRule, className }: Props) {
  if (!repeatRule) return null;
  return (
    <span
      data-repeat-badge
      className={cn('inline-flex items-center text-xs text-muted-foreground', className)}
    >
      <Repeat className="h-3 w-3" />
    </span>
  );
}
