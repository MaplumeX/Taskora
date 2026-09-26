import {
  useCalendarDay,
  parseCalendarDate,
  toInputDateValue,
  startOfToday,
  startOfTomorrow,
  usePreferencesStore,
} from '@taskora/api';
import { useTranslation } from 'react-i18next';

import type { DueDateFieldCurrent, DueDateFieldPatch } from './fieldProps';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';

import { getCalendarLocale } from './calendarFieldUtils';

interface FieldProps {
  current: DueDateFieldCurrent;
  onPatch: (data: DueDateFieldPatch) => void;
  onClose?: () => void;
}

export function DueDateField({ current, onPatch, onClose }: FieldProps) {
  useCalendarDay();
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);

  const selectedDate = current.dueDate ? parseCalendarDate(current.dueDate) : undefined;

  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    onPatch({ dueDate: toInputDateValue(date) });
    onClose?.();
  };

  const handleToday = () => {
    onPatch({ dueDate: toInputDateValue(startOfToday()) });
    onClose?.();
  };

  const handleTomorrow = () => {
    onPatch({ dueDate: toInputDateValue(startOfTomorrow()) });
    onClose?.();
  };

  const handleClear = () => {
    onPatch({ dueDate: null });
    onClose?.();
  };

  return (
    <div className="flex flex-col">
      <Calendar
        selected={selectedDate}
        onSelect={handleDaySelect}
        locale={getCalendarLocale(i18n.language)}
        weekStartsOn={weekStartsOn}
      />
      <div className="flex items-center gap-1 border-t border-border/50 p-2">
        <Button variant="ghost" size="sm" onClick={handleToday}>
          {t('common:today')}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleTomorrow}>
          {t('common:tomorrow')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!current.dueDate}
          onClick={handleClear}
          className="ml-auto"
        >
          {t('common:clear')}
        </Button>
      </div>
    </div>
  );
}
