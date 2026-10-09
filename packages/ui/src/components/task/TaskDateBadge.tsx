import { useCalendarDay, parseCalendarDate, formatShortDate, startOfTomorrow } from '@taskora/api';
import { cn } from '@/lib/utils';

/**
 * 行首计划日期标记的显示方式：true = 黄星或灰色 chip；false = 都不显示
 * （视图本身即日期语境，如 Upcoming 的日分组）；'future' = 只在计划日期
 * 晚于今天时显示灰色 chip（Today：截止日期带进来的条目可能计划在以后）。
 */
export type ScheduledBadgeMode = boolean | 'future';

interface Props {
  scheduledDate: string | null;
  className?: string;
}

/**
 * Task 行上的计划日期 chip——参考 Things 3:
 * 圆角灰底胶囊 + 短绝对日期（"Sep 2"），无图标，放在复选框与标题之间；
 * 相对日期（Today/Tomorrow/星期几）只留给分组标题（Upcoming）。
 * 仅用于未来日期；≤ 今天（含计划日期已过的任务）由 TaskTodayBadge 黄星表达——
 * When 是计划开始日、永不逾期，红色警示只属于 Deadline。
 */
export function TaskDateBadge({ scheduledDate, className }: Props) {
  useCalendarDay();
  if (!scheduledDate) return null;
  const date = parseCalendarDate(scheduledDate);
  if (date < startOfTomorrow()) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-muted px-1.5 text-meta font-medium tabular-nums text-muted-foreground',
        className,
      )}
    >
      {formatShortDate(date)}
    </span>
  );
}
