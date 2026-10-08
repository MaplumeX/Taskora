import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CalendarRange, Sunrise } from 'lucide-react';

import {
  parseCalendarDate,
  todayDateKey,
  toInputDateValue,
  useCalendarDay,
  usePreferencesStore,
} from '@taskora/api';
import { addReviewInterval, REVIEW_UNITS, type ReviewInterval } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { getCalendarLocale } from '@/components/task/fields/calendarFieldUtils';
import { DateShortcutList } from '@/components/task/fields/DateShortcutList';
import { cn } from '@/lib/utils';

/** 「每 2 周」式的间隔文案。 */
export function useReviewIntervalLabel(): (interval: ReviewInterval) => string {
  const { t } = useTranslation('review');
  // 1 单独成句（「每周」而不是「每 1 周」）：中文没有单复数形式可借
  return (interval) =>
    interval.count === 1
      ? t(`everySingle_${interval.unit}`)
      : t(`every_${interval.unit}`, { count: interval.count });
}

/** 「3 周前」式的上次回顾日文案；null 为「从未回顾」。 */
export function useLastReviewedLabel(): (lastReviewedOn: string | null | undefined) => string {
  const { t } = useTranslation('review');
  useCalendarDay();
  return (lastReviewedOn) => {
    if (!lastReviewedOn) return t('neverReviewed');
    const days = Math.round(
      (parseCalendarDate(todayDateKey()).getTime() - parseCalendarDate(lastReviewedOn).getTime()) /
        86_400_000,
    );
    if (days <= 0) return t('reviewedToday');
    if (days < 14) return t('daysAgo', { count: days });
    if (days < 60) return t('weeksAgo', { count: Math.floor(days / 7) });
    if (days < 365) return t('monthsAgo', { count: Math.floor(days / 30) });
    return t('yearsAgo', { count: Math.floor(days / 365) });
  };
}

/** 回顾间隔的上限：与重复规则的间隔一致。 */
const MAX_COUNT = 999;

/**
 * 回顾间隔编辑：「每 [− N +] [天|周|月|年]」，与重复规则的间隔编辑同一套
 * 样式。改动即时生效。
 */
export function ReviewIntervalEditor({
  value,
  onChange,
}: {
  value: ReviewInterval;
  onChange: (next: ReviewInterval) => void;
}) {
  const { t } = useTranslation('review');

  const changeCount = (delta: number) => {
    const count = Math.min(MAX_COUNT, Math.max(1, value.count + delta));
    if (count !== value.count) onChange({ ...value, count });
  };

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 max-md:gap-3 max-md:py-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5" aria-label={t('interval')}>
          <span className="mr-1 select-none text-xs text-muted-foreground max-md:text-sm">
            {t('every')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 px-0 max-md:h-10 max-md:w-10 max-md:text-base"
            aria-label={t('countMinus')}
            disabled={value.count <= 1}
            onClick={() => changeCount(-1)}
          >
            −
          </Button>
          <span className="w-6 select-none text-center text-sm tabular-nums">{value.count}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 px-0 max-md:h-10 max-md:w-10 max-md:text-base"
            aria-label={t('countPlus')}
            disabled={value.count >= MAX_COUNT}
            onClick={() => changeCount(1)}
          >
            +
          </Button>
        </div>
        <div
          role="radiogroup"
          aria-label={t('unit')}
          className="ml-auto flex rounded-md bg-muted p-0.5 max-md:flex-1"
        >
          {REVIEW_UNITS.map((unit) => {
            const active = value.unit === unit;
            return (
              <button
                key={unit}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  if (!active) onChange({ ...value, unit });
                }}
                className={cn(
                  'h-6 min-w-8 select-none rounded-[5px] px-1.5 text-xs transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 max-md:h-9 max-md:flex-1 max-md:text-sm',
                  active
                    ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.12)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`unit_${unit}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 下次回顾日的快捷选项（下次回顾日编辑与回顾栏的「延后」共用）。 */
export function useReviewDateShortcuts(): Array<{
  key: string;
  label: string;
  icon: ReactNode;
  date: string;
}> {
  const { t } = useTranslation('review');
  useCalendarDay();
  const today = todayDateKey();
  return [
    {
      key: 'tomorrow',
      label: t('common:tomorrow'),
      icon: <Sunrise className="text-nav-upcoming" />,
      date: addReviewInterval(today, { unit: 'day', count: 1 }),
    },
    {
      key: 'nextWeek',
      label: t('inOneWeek'),
      icon: <CalendarDays className="text-muted-foreground" />,
      date: addReviewInterval(today, { unit: 'week', count: 1 }),
    },
    {
      key: 'nextMonth',
      label: t('inOneMonth'),
      icon: <CalendarRange className="text-muted-foreground" />,
      date: addReviewInterval(today, { unit: 'month', count: 1 }),
    },
  ];
}

/** 下次回顾日选择：快捷选项（明天 / 1 周后 / 1 个月后）+ 日历；value / onChange 为日期键。 */
export function NextReviewDateEditor({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string) => void;
}) {
  const shortcuts = useReviewDateShortcuts();
  return (
    <div className="flex flex-col gap-1">
      <DateShortcutList
        items={shortcuts.map((shortcut) => ({
          key: shortcut.key,
          label: shortcut.label,
          icon: shortcut.icon,
          active: value === shortcut.date,
          onSelect: () => onChange(shortcut.date),
        }))}
      />
      <NextReviewDateCalendar value={value} onChange={onChange} />
    </div>
  );
}

/** 下次回顾日的日历；value / onChange 为日期键。 */
export function NextReviewDateCalendar({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string) => void;
}) {
  const { i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  return (
    <Calendar
      selected={value ? parseCalendarDate(value) : undefined}
      onSelect={(date: Date | undefined) => {
        if (date) onChange(toInputDateValue(date));
      }}
      locale={getCalendarLocale(i18n.language)}
      weekStartsOn={weekStartsOn}
    />
  );
}
