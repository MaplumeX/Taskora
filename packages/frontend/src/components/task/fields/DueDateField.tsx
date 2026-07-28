import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';

import { toInputDateValue, fromInputDateValue } from '@/lib/utils/date';

interface FieldProps {
  current: TaskResponseDto;
  onPatch: (data: UpdateTaskDto) => void;
}

export function DueDateField({ current, onPatch }: FieldProps) {
  const dueDateValue = current.dueDate
    ? toInputDateValue(new Date(current.dueDate))
    : '';

  return (
    <input
      type="date"
      value={dueDateValue}
      onChange={(e) => {
        const value = e.target.value;
        if (value) onPatch({ dueDate: fromInputDateValue(value).toISOString() });
        else onPatch({ dueDate: null });
      }}
      className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
