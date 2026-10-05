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
import type { WhenCandidate } from '@taskora/shared';

import { Calendar } from '@/components/ui/calendar';

import { getCalendarLocale } from './calendarFieldUtils';
import { DateShortcutList } from './DateShortcutList';
import { WhenQueryInput } from './WhenQueryInput';

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

  // 自然语言输入：截止日期不设时刻，也没有 Someday。
  const handleQuerySelect = (candidate: WhenCandidate) => {
    if (candidate.kind === 'clear') return handleClear();
    if (candidate.kind !== 'date') return;
    onPatch({ dueDate: candidate.date });
    onClose?.();
  };

  return (
    <WhenQueryInput
      placeholder={t('task:deadlineQueryPlaceholder')}
      allowSomeday={false}
      showTime={false}
      todayIcon={<Flag className="text-deadline" />}
      onSelect={handleQuerySelect}
    >
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
        clear={{
          label: t('common:clear'),
          disabled: !current.dueDate,
          onClear: handleClear,
        }}
      />
      <Calendar
        selected={selectedDate}
        onSelect={handleDaySelect}
        locale={getCalendarLocale(i18n.language)}
        weekStartsOn={weekStartsOn}
      />
    </WhenQueryInput>
  );
}
