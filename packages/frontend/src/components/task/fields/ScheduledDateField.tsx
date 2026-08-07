import { useTranslation } from 'react-i18next';
import { zhCN, enUS } from 'react-day-picker/locale';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { startOfToday } from '@/lib/utils/date';

interface FieldProps {
  current: TaskResponseDto;
  onPatch: (data: UpdateTaskDto) => void;
}

const LOCALE_BY_LANG: Record<string, typeof zhCN> = {
  zh: zhCN,
  en: enUS,
};

export function ScheduledDateField({ current, onPatch }: FieldProps) {
  const { t, i18n } = useTranslation();

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;
  const selectedDate =
    scheduledType === ScheduledType.DATE && current.scheduledDate
      ? new Date(current.scheduledDate)
      : undefined;

  const locale = LOCALE_BY_LANG[i18n.language] ?? enUS;

  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: startOfTodayOrDate(date).toISOString(),
    });
  };

  const handleToday = () =>
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: startOfToday().toISOString(),
    });

  const handleSomeday = () => onPatch({ scheduledType: ScheduledType.SOMEDAY });

  const handleClear = () =>
    onPatch({ scheduledType: ScheduledType.NONE, scheduledDate: null });

  return (
    <div className="flex flex-col">
      <Calendar
        selected={selectedDate}
        onSelect={handleDaySelect}
        locale={locale}
      />
      <div className="flex items-center gap-1 border-t border-border/50 p-2">
        <Button variant="ghost" size="sm" onClick={handleToday}>
          {t('common:today')}
        </Button>
        <Button
          variant={scheduledType === ScheduledType.SOMEDAY ? 'secondary' : 'ghost'}
          size="sm"
          onClick={handleSomeday}
        >
          {t('task:somedayLabel')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={scheduledType === ScheduledType.NONE}
          onClick={handleClear}
          className="ml-auto"
        >
          {t('common:clear')}
        </Button>
      </div>
    </div>
  );
}

/** Normalize a picked date to local midnight to avoid off-by-one ISO shifts. */
function startOfTodayOrDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}