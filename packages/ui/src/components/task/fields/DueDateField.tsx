import {
  useCalendarDay,
  parseCalendarDate,
  toInputDateValue,
  startOfToday,
  startOfTomorrow,
  isToday,
  isTomorrow,
  usePreferencesStore,
} from '@taskora/api';
import { useTranslation } from 'react-i18next';
import { Flag, Sunrise } from 'lucide-react';

import type { DueDateFieldCurrent, DueDateFieldPatch } from './fieldProps';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

import { FOOTER_BUTTON_CLASS } from './ScheduledDateField';

import { getCalendarLocale } from './calendarFieldUtils';
import { DateShortcutList } from './DateShortcutList';

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
      <DateShortcutList
        items={[
          {
            key: 'today',
            label: t('common:today'),
            icon: <Flag className="text-deadline" />,
            active: selectedDate !== undefined && isToday(selectedDate),
            onSelect: handleToday,
          },
          {
            key: 'tomorrow',
            label: t('common:tomorrow'),
            icon: <Sunrise className="text-nav-upcoming" />,
            active: selectedDate !== undefined && isTomorrow(selectedDate),
            onSelect: handleTomorrow,
          },
        ]}
      />
      <Calendar
        selected={selectedDate}
        onSelect={handleDaySelect}
        locale={getCalendarLocale(i18n.language)}
        weekStartsOn={weekStartsOn}
      />
      <div className="flex items-center border-t border-border/50 px-1 pt-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!current.dueDate}
          onClick={handleClear}
          className={cn('w-full', FOOTER_BUTTON_CLASS)}
        >
          {t('common:clear')}
        </Button>
      </div>
    </div>
  );
}
