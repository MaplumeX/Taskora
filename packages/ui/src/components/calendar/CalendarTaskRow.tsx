import { useTranslation } from 'react-i18next';

import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import { cn } from '@/lib/utils';
import type { TaskResponseDto } from '@taskora/shared';

interface CalendarTaskRowProps {
  task: TaskResponseDto;
  onToggleComplete: (task: TaskResponseDto) => void;
}

export function CalendarTaskRow({ task, onToggleComplete }: CalendarTaskRowProps) {
  const { t } = useTranslation();
  const completed = task.status === 'COMPLETED';

  return (
    <div className="group/taskrow flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent/60">
      <TaskCheckbox
        checked={completed}
        onToggle={() => onToggleComplete(task)}
        className="h-3.5 w-3.5"
      />
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-xs leading-4 text-foreground',
          completed && 'text-muted-foreground line-through',
        )}
        title={task.title}
      >
        {task.title || t('common:empty')}
      </button>
    </div>
  );
}
