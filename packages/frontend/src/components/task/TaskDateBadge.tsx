import { Calendar } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDateLabel, isOverdue, isToday } from '@/lib/utils/date';

interface Props {
  scheduledDate: string | null;
  className?: string;
}

export function TaskDateBadge({ scheduledDate, className }: Props) {
  if (!scheduledDate) return null;
  const date = new Date(scheduledDate);
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
      <Calendar className="h-3 w-3" />
      {formatDateLabel(date)}
    </span>
  );
}