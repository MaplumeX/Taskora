import { useTranslation } from 'react-i18next';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { toInputDateValue, fromInputDateValue } from '@/lib/utils/date';

interface FieldProps {
  current: TaskResponseDto;
  onPatch: (data: UpdateTaskDto) => void;
}

export function ScheduledDateField({ current, onPatch }: FieldProps) {
  const { t } = useTranslation();

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;
  const dateValue = current.scheduledDate
    ? toInputDateValue(new Date(current.scheduledDate))
    : '';

  const onScheduledTypeChange = (type: ScheduledType) =>
    onPatch({ scheduledType: type });

  const onDateChange = (value: string) => {
    if (value)
      onPatch({
        scheduledType: ScheduledType.DATE,
        scheduledDate: fromInputDateValue(value).toISOString(),
      });
    else onPatch({ scheduledType: ScheduledType.NONE });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {[ScheduledType.NONE, ScheduledType.DATE, ScheduledType.SOMEDAY].map(
          (type) => (
            <button
              key={type}
              type="button"
              onClick={() => onScheduledTypeChange(type)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                scheduledType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-input text-muted-foreground hover:bg-muted',
              )}
            >
              {type === ScheduledType.NONE
                ? t('common:none')
                : type === ScheduledType.DATE
                  ? t('task:scheduledDate')
                  : t('task:somedayLabel')}
            </button>
          ),
        )}
      </div>
      {scheduledType === ScheduledType.DATE && (
        <input
          type="date"
          value={dateValue}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </div>
  );
}
