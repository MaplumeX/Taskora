import { useCalendarDay, instantCalendarDate, startOfToday } from '@taskora/api';
import { i18n } from '@/i18n/config';
import { cn } from '@/lib/utils';

interface Props {
  /** ISO 时间戳（settledAt / completedAt） */
  date: string;
  className?: string;
}

/**
 * 行内了却日期徽标——参考 Things 3：完成日期紧贴标题、远期显示完整日期。
 * 所有分组一律只显示日期（不显示时刻）；跨年时带上年份。
 */
export function SettledDateBadge({ date, className }: Props) {
  useCalendarDay();
  const d = instantCalendarDate(date);
  const now = startOfToday();
  const sameYear = d.getFullYear() === now.getFullYear();
  const label = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d);

  return <span className={cn('shrink-0 text-xs text-muted-foreground', className)}>{label}</span>;
}
