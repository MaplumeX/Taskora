import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

import type { TaskResponseDto } from '@taskora/shared';

import { CalendarQuickAdd } from './CalendarQuickAdd';
import { CalendarTaskRow } from './CalendarTaskRow';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

  const popoverDateLabel = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    weekday: 'long',
  }).format(date);

  return (
    <div
      data-calendar-date={dateKey}
      className={cn(
        'group/day flex min-h-20 flex-col gap-1 overflow-hidden rounded-lg border border-border/40 bg-card p-2 transition-colors hover:bg-accent/30',
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
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="rounded-sm px-1 text-left text-[11px] font-medium text-primary hover:bg-accent/60"
            >
              {t('calendar:overflowMore', { count: overflowCount })}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="flex max-h-80 w-64 flex-col gap-1 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-1 pb-1 text-sm font-semibold text-foreground">
              {popoverDateLabel}
            </p>
            <div className="flex flex-col gap-0.5 overflow-y-auto">
              {tasks.map((task) => (
                <CalendarTaskRow
                  key={task.id}
                  task={task}
                  onToggleComplete={onToggleComplete}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {adding && <CalendarQuickAdd dateKey={dateKey} onDone={() => setAdding(false)} />}
    </div>
  );
}
