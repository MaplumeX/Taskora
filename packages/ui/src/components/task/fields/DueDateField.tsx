import { useTranslation } from 'react-i18next';

import type { DueDateFieldCurrent, DueDateFieldPatch } from './fieldProps';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { startOfToday } from '@taskora/api';
import { usePreferencesStore } from '@taskora/api';

import { getCalendarLocale, startOfLocalDay } from './calendarFieldUtils';

interface FieldProps {
  current: DueDateFieldCurrent;
  onPatch: (data: DueDateFieldPatch) => void;
  onClose?: () => void;
}

export function DueDateField({ current, onPatch, onClose }: FieldProps) {
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);

  const selectedDate = current.dueDate ? new Date(current.dueDate) : undefined;

  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    onPatch({ dueDate: startOfLocalDay(date).toISOString() });
    onClose?.();
  };

  const handleToday = () => {
    onPatch({ dueDate: startOfToday().toISOString() });
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
