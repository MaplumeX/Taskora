import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDateLabel, isOverdue, isToday } from '@/lib/utils/date';

interface Props {
  dueDate: string | null;
  className?: string;
}

export function TaskDueDateBadge({ dueDate, className }: Props) {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  const overdue = isOverdue(date);
  const today = isToday(date);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        overdue || today ? 'text-[#CC4444]' : 'text-muted-foreground',
        className,
      )}
    >
      <Clock className="h-3 w-3" />
      {formatDateLabel(date)}
    </span>
  );
}