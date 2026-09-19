import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import type { TaskResponseDto } from '@taskora/shared';

import { CalendarMonthGrid } from '@/components/calendar/CalendarMonthGrid';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { useScheduledTasksQuery } from '@taskora/api';
import { useCompleteTask, useSelectionScope, useTaskRowSelection, useUncompleteTask } from '@taskora/api';
import { usePreferencesStore } from '@taskora/api';
import { addMonths, groupByScheduledDate } from '@taskora/api';
import { i18n } from '@taskora/api';

export default function Calendar() {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useScheduledTasksQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);

  const [anchor, setAnchor] = useState(() => new Date());

  const tasksByDate = useMemo(() => groupByScheduledDate(tasks), [tasks]);

  // 注册可遍历行（按当前月网格顺序；键盘动作经全局 keymap 生效）。
  const { selectedIds, handleRowClick } = useTaskRowSelection();
  const rows = useMemo(
    () =>
      tasks.map((t) => ({
        id: t.id,
        kind: 'task' as const,
        completed: t.status === 'COMPLETED',
        cancelled: t.status === 'CANCELLED',
      })),
    [tasks],
  );
  useSelectionScope(rows);

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
    setAnchor((prev) => addMonths(prev, direction));
  };

  const periodLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      year: 'numeric',
    });
    return formatter.format(anchor);
  }, [anchor, i18n.language]);

  return (
    <div className="flex h-full flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t('nav:calendar')}
        </h1>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Hint label={t('calendar:previous')}>
            <Button variant="ghost" size="icon" aria-label={t('calendar:previous')} onClick={() => step(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Hint>
          <Hint label={t('calendar:next')}>
            <Button variant="ghost" size="icon" aria-label={t('calendar:next')} onClick={() => step(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Hint>
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
      ) : isLoading ? null : (
        <CalendarMonthGrid
          anchor={anchor}
          tasksByDate={tasksByDate}
          weekStartsOn={weekStartsOn}
          locale={i18n.language}
          onToggleComplete={handleToggleComplete}
          selectedIds={selectedIds}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  );
}
