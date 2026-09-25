import { cn } from '@/lib/utils';
import { formatShortDate, startOfTomorrow } from '@taskora/api';

interface Props {
  scheduledDate: string | null;
  className?: string;
}

/**
 * Task 行上的计划日期 chip——参考 Things 3:
 * 圆角灰底胶囊 + 短绝对日期（"Sep 2"），无图标，放在复选框与标题之间；
 * 相对日期（Today/Tomorrow/星期几）只留给分组标题（Upcoming）。
 * 仅用于未来日期；≤ 今天（含逾期）由 TaskTodayBadge 黄星表达——
 * When 是计划开始日、永不逾期，红色警示只属于 Deadline。
 */
export function TaskDateBadge({ scheduledDate, className }: Props) {
  if (!scheduledDate) return null;
  const date = new Date(scheduledDate);
  if (date < startOfTomorrow()) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground',
        className,
      )}
    >
      {formatShortDate(date)}
    </span>
  );
}
