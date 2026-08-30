import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import type { TaskResponseDto } from '@taskora/shared';

import { CalendarMonthGrid } from '@/components/calendar/CalendarMonthGrid';
import { CalendarWeekGrid } from '@/components/calendar/CalendarWeekGrid';
import { Button } from '@/components/ui/button';
import { useDueTasksQuery } from '@/lib/hooks/useDueTasksQuery';
import { useCompleteTask, useUncompleteTask } from '@/lib/hooks/useTasks';
import { usePreferencesStore } from '@/lib/stores/preferences.store';
import { addDays, addMonths, groupByDueDate } from '@/lib/utils/calendarGrid';
import { cn } from '@/lib/utils';
import { i18n } from '@/i18n/config';

type CalendarViewMode = 'month' | 'week';

export default function Calendar() {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useDueTasksQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());

  const tasksByDate = useMemo(() => groupByDueDate(tasks), [tasks]);

  const handleToggleComplete = (task: TaskResponseDto) => {
    if (task.status === 'COMPLETED') {
      uncompleteTask.mutate(task.id, {
        onError: () => toast.error(t('common:operationFailed')),
      });
    } else {
      completeTask.mutate(task.id, {
        onError: () => toast.error(t('common:operationFailed')),
      });
    }
  };

  const step = (direction: 1 | -1) => {
    setAnchor((prev) =>
      viewMode === 'month' ? addMonths(prev, direction) : addDays(prev, direction * 7),
    );
  };

  const periodLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      year: 'numeric',
    });
    if (viewMode === 'month') {
      return formatter.format(anchor);
    }
    const start = new Date(anchor);
    start.setDate(start.getDate() - ((anchor.getDay() - weekStartsOn + 7) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const rangeFormatter = new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
    });
    return `${rangeFormatter.format(start)} – ${rangeFormatter.format(end)}`;
  }, [anchor, viewMode, weekStartsOn, i18n.language]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t('nav:calendar')}
        </h1>
        <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
          {(['month', 'week'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                'rounded-full px-3 py-1 text-sm transition-colors',
                viewMode === mode
                  ? 'bg-background font-medium text-foreground shadow-soft'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`calendar:view_${mode}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t('calendar:previous')} onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t('calendar:next')} onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setAnchor(new Date())}
          >
            <CalendarRange className="h-4 w-4" />
            {t('calendar:today')}
          </Button>
        </div>
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          {periodLabel}
        </span>
      </div>

      {isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : isLoading ? null : viewMode === 'month' ? (
        <CalendarMonthGrid
          anchor={anchor}
          tasksByDate={tasksByDate}
          weekStartsOn={weekStartsOn}
          locale={i18n.language}
          onToggleComplete={handleToggleComplete}
        />
      ) : (
        <CalendarWeekGrid
          anchor={anchor}
          tasksByDate={tasksByDate}
          weekStartsOn={weekStartsOn}
          locale={i18n.language}
          onToggleComplete={handleToggleComplete}
        />
      )}
    </div>
  );
}
