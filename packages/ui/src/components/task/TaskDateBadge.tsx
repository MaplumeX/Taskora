import { cn } from '@/lib/utils';
import { formatShortDate, isOverdue, isToday } from '@taskora/api';

interface Props {
  scheduledDate: string | null;
  className?: string;
}

/**
 * Task 行上的计划日期 chip——参考 Things 3:
 * 圆角灰底胶囊 + 短绝对日期（"Sep 2"），无图标，放在复选框与标题之间；
 * 相对日期（Today/Tomorrow/星期几）只留给分组标题（Upcoming）。
 * 逾期/今天用红色保留紧迫信号，未来日期灰色。
 */
export function TaskDateBadge({ scheduledDate, className }: Props) {
  if (!scheduledDate) return null;
  const date = new Date(scheduledDate);
  const overdue = isOverdue(date);
  const today = isToday(date);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums',
        overdue || today ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {formatShortDate(date)}
    </span>
  );
}
