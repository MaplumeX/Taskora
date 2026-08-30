import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

import type { TaskResponseDto } from '@taskora/shared';

import { CalendarQuickAdd } from './CalendarQuickAdd';
import { CalendarTaskRow } from './CalendarTaskRow';
import { cn } from '@/lib/utils';
import { isToday, toInputDateValue } from '@/lib/utils/date';
import { i18n } from '@/i18n/config';

interface CalendarDayCellProps {
  date: Date;
  tasks: TaskResponseDto[];
  /** Max visible task rows before the "+N more" overflow indicator; 0/null = show all */
  maxRows?: number;
  outOfMonth?: boolean;
  onToggleComplete: (task: TaskResponseDto) => void;
}

export function CalendarDayCell({
  date,
  tasks,
  maxRows,
  outOfMonth = false,
  onToggleComplete,
}: CalendarDayCellProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);

  const dateKey = toInputDateValue(date);
  const isTodayCell = isToday(date);

  const visibleTasks = maxRows ? tasks.slice(0, maxRows) : tasks;
  const overflowCount = maxRows ? Math.max(0, tasks.length - visibleTasks.length) : 0;

  const startAdd = () => setAdding(true);

  return (
    <div
      data-calendar-date={dateKey}
      className={cn(
        'flex min-h-24 flex-col gap-1 rounded-lg border border-border/40 bg-card p-2 transition-colors hover:bg-accent/30',
        outOfMonth && 'opacity-50',
      )}
      // Single click on the cell's blank area opens quick-add (PRD R4).
      // Task rows and the plus button stop propagation themselves,
      // so a bubbled click here means the blank area was clicked.
      onClick={startAdd}
      onDoubleClick={startAdd}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex min-w-5 justify-center rounded-full px-1 text-xs tabular-nums text-muted-foreground',
            isTodayCell && 'bg-primary font-semibold text-primary-foreground',
          )}
        >
          {date.getDate()}
        </span>
        {!adding && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startAdd();
            }}
            aria-label={t('calendar:addTaskOnDate', {
              date: new Intl.DateTimeFormat(i18n.language, {
                month: 'short',
                day: 'numeric',
              }).format(date),
            })}
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/day:opacity-100"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {visibleTasks.map((task) => (
        <CalendarTaskRow key={task.id} task={task} onToggleComplete={onToggleComplete} />
      ))}

      {overflowCount > 0 && (
        <span className="px-1 text-[11px] text-muted-foreground">
          {t('calendar:overflowMore', { count: overflowCount })}
        </span>
      )}

      {adding && <CalendarQuickAdd dateKey={dateKey} onDone={() => setAdding(false)} />}
    </div>
  );
}
