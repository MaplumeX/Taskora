import { Flag } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDeadlineCountdown, isOverdue, isToday } from '@taskora/api';

interface Props {
  dueDate: string | null;
  className?: string;
}

/**
 * 截止徽标——参考 Things 3:行尾旗帜 + 倒计时文案("x days left"),
 * 到期/逾期变红;倒计时比绝对日期更有时间感,且与行首计划日期 chip
 * 的短绝对格式形成语义区分(计划做 vs 必须完成)。
 */
export function TaskDueDateBadge({ dueDate, className }: Props) {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  const overdue = isOverdue(date);
  const today = isToday(date);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        overdue || today ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {/* 旗帜图标:对齐 Things 3 的 deadline 视觉语言(行尾灰旗,到期/逾期变红)。 */}
      <Flag className="h-3 w-3" />
      {formatDeadlineCountdown(date)}
    </span>
  );
}
