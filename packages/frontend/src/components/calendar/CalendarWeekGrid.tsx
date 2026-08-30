import { useMemo } from 'react';

import type { TaskResponseDto } from '@taskora/shared';

import { CalendarDayCell } from './CalendarDayCell';
import { buildWeekDays, buildWeekdayLabels, type WeekStartsOn } from '@/lib/utils/calendarGrid';
import { toInputDateValue } from '@/lib/utils/date';

interface CalendarWeekGridProps {
  anchor: Date;
  tasksByDate: Map<string, TaskResponseDto[]>;
  weekStartsOn: WeekStartsOn;
  locale: string;
  onToggleComplete: (task: TaskResponseDto) => void;
}

export function CalendarWeekGrid({
  anchor,
  tasksByDate,
  weekStartsOn,
  locale,
  onToggleComplete,
}: CalendarWeekGridProps) {
  const days = useMemo(() => buildWeekDays(anchor, weekStartsOn), [anchor, weekStartsOn]);
  const weekdayLabels = useMemo(
    () => buildWeekdayLabels(locale, weekStartsOn),
    [locale, weekStartsOn],
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label) => (
          <span
            key={label}
            className="pb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="grid min-h-96 grid-cols-7 gap-1">
        {days.map((date) => (
          <div key={date.toISOString()} className="group/day">
            <CalendarDayCell
              date={date}
              tasks={tasksByDate.get(toInputDateValue(date)) ?? []}
              onToggleComplete={onToggleComplete}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
