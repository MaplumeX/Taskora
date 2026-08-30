import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TaskResponseDto } from '@taskora/shared';

import { CalendarDayCell } from './CalendarDayCell';
import { buildMonthCells, buildWeekdayLabels, type WeekStartsOn } from '@/lib/utils/calendarGrid';
import { toInputDateValue } from '@/lib/utils/date';
import { cn } from '@/lib/utils';

interface CalendarMonthGridProps {
  anchor: Date;
  tasksByDate: Map<string, TaskResponseDto[]>;
  weekStartsOn: WeekStartsOn;
  locale: string;
  onToggleComplete: (task: TaskResponseDto) => void;
}

export function CalendarMonthGrid({
  anchor,
  tasksByDate,
  weekStartsOn,
  locale,
  onToggleComplete,
}: CalendarMonthGridProps) {
  const { t } = useTranslation();
  const cells = useMemo(() => buildMonthCells(anchor, weekStartsOn), [anchor, weekStartsOn]);
  const weekdayLabels = useMemo(
    () => buildWeekdayLabels(locale, weekStartsOn),
    [locale, weekStartsOn],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {weekdayLabels.map((label) => (
          <span
            key={label}
            className="pb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((date) => (
          <div key={date.toISOString()} className="group/day">
            <CalendarDayCell
              date={date}
              tasks={tasksByDate.get(toInputDateValue(date)) ?? []}
              maxRows={3}
              outOfMonth={date.getMonth() !== anchor.getMonth()}
              onToggleComplete={onToggleComplete}
            />
          </div>
        ))}
      </div>
      <p className={cn('sr-only')}>{t('calendar:monthGridLabel')}</p>
    </div>
  );
}
