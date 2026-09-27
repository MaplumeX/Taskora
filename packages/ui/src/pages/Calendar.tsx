import {
  useCalendarDay,
  useScheduledTasksQuery,
  useSelectionScope,
  useTaskRowSelection,
  usePreferencesStore,
  addMonths,
  groupByScheduledDate,
  i18n,
  startOfToday,
  toInputDateValue,
} from '@taskora/api';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';

import { CalendarDaySheet } from '@/components/calendar/CalendarDaySheet';
import { CalendarMonthGrid } from '@/components/calendar/CalendarMonthGrid';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { PageHeading } from '@/components/layout/PageHeading';

export default function Calendar() {
  const calendarDay = useCalendarDay();
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useScheduledTasksQuery();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);

  const [anchor, setAnchor] = useState(() => startOfToday());
  // 点日格打开当天的完整列表（窄屏底部面板 / 宽屏居中卡片）。
  const [openDay, setOpenDay] = useState<Date | null>(null);

  const tasksByDate = useMemo(() => groupByScheduledDate(tasks), [tasks, calendarDay]);

  // 注册可遍历行（按当前月网格顺序；键盘动作经全局 keymap 生效）。
  const { selectedIds } = useTaskRowSelection();
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
    <div className="flex h-full flex-col gap-3 pb-4 max-md:gap-2 max-md:pb-2">
      {/* 窄屏网格贴边（MainContent 不给左右内边距），页头自行补齐 */}
      <div className="flex flex-wrap items-center justify-between gap-2 max-md:px-4">
        <PageHeading nav="/calendar">{t('nav:calendar')}</PageHeading>
      </div>

      <div className="flex items-center justify-between gap-2 max-md:px-2">
        <div className="flex items-center gap-1">
          <Hint label={t('calendar:previous')}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('calendar:previous')}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Hint>
          <Hint label={t('calendar:next')}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('calendar:next')}
              onClick={() => step(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Hint>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setAnchor(startOfToday())}
          >
            <CalendarRange className="h-4 w-4" />
            {t('calendar:today')}
          </Button>
        </div>
        <span className="font-display text-lg font-semibold tracking-tight text-foreground max-md:pr-2">
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
          selectedIds={selectedIds}
          onOpenDay={setOpenDay}
        />
      )}

      <CalendarDaySheet
        date={openDay}
        tasks={openDay ? (tasksByDate.get(toInputDateValue(openDay)) ?? []) : []}
        onClose={() => setOpenDay(null)}
      />
    </div>
  );
}
