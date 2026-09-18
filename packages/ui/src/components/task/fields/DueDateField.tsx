import type { DueDateFieldCurrent, DueDateFieldPatch } from './fieldProps';

import { toInputDateValue, fromInputDateValue } from '@taskora/api';

interface FieldProps {
  current: DueDateFieldCurrent;
  onPatch: (data: DueDateFieldPatch) => void;
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
