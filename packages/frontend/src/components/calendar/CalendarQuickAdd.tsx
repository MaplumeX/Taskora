import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ScheduledType } from '@taskora/shared';

import { useCreateTask } from '@/lib/hooks/useTasks';
import { fromInputDateValue } from '@/lib/utils/date';

interface CalendarQuickAddProps {
  dateKey: string; // yyyy-MM-dd (local)
  onDone?: () => void;
}

export function CalendarQuickAdd({ dateKey, onDone }: CalendarQuickAddProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTask();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      onDone?.();
      return;
    }
    createTask.mutate(
      {
        title: trimmed,
        dueDate: fromInputDateValue(dateKey).toISOString(),
        scheduledType: ScheduledType.NONE,
      },
      {
        onSuccess: () => {
          setTitle('');
          inputRef.current?.focus();
        },
        onError: () => toast.error(t('common:createFailed')),
      },
    );
  };

  return (
    <div
      className="flex items-center gap-1.5 px-1 py-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onDone?.();
          }
        }}
        // autoFocus: quick-add opens with intent to type (immediate input focus is the UX)
        autoFocus
        placeholder={t('calendar:quickAddPlaceholder')}
        aria-label={t('calendar:quickAddPlaceholder')}
        className="h-6 w-full min-w-0 rounded-sm border border-border/60 bg-background px-1.5 text-xs leading-6 outline-none placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}
