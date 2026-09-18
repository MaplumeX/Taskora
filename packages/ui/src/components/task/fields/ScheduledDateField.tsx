import { useTranslation } from 'react-i18next';

import type { ScheduledFieldCurrent, ScheduledFieldPatch } from './fieldProps';
import { ScheduledType } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { startOfToday } from '@taskora/api';
import { usePreferencesStore } from '@taskora/api';

import { getCalendarLocale, startOfLocalDay } from './calendarFieldUtils';

interface FieldProps {
  current: ScheduledFieldCurrent;
  onPatch: (data: ScheduledFieldPatch) => void;
  onClose?: () => void;
}

export function ScheduledDateField({ current, onPatch, onClose }: FieldProps) {
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;
  const selectedDate =
    scheduledType === ScheduledType.DATE && current.scheduledDate
      ? new Date(current.scheduledDate)
      : undefined;

  const locale = getCalendarLocale(i18n.language);

  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: startOfLocalDay(date).toISOString(),
    });
    onClose?.();
  };

  const handleToday = () => {
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: startOfToday().toISOString(),
    });
    onClose?.();
  };

  const handleSomeday = () => {
    onPatch({ scheduledType: ScheduledType.SOMEDAY });
    onClose?.();
  };

  const handleClear = () => {
    onPatch({ scheduledType: ScheduledType.NONE, scheduledDate: null });
    onClose?.();
  };

  return (
    <div className="flex flex-col">
      <Calendar
        selected={selectedDate}
        onSelect={handleDaySelect}
        locale={locale}
        weekStartsOn={weekStartsOn}
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

