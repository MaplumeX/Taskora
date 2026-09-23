import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Props {
  /** Reminder 时刻（HH:mm）；null 不渲染（reminders spec）。 */
  reminderTime: string | null;
  className?: string;
}

/** Task 行上的时钟徽标：Clock 图标 + HH:mm（与日期徽标并排）。 */
export function TaskReminderBadge({ reminderTime, className }: Props) {
  if (!reminderTime) return null;
  return (
    <span
      data-reminder-badge
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground',
        className,
      )}
    >
      <Clock className="h-3 w-3" />
      {reminderTime}
    </span>
  );
}
