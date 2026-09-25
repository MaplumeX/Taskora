import { useTranslation } from 'react-i18next';

import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import { cn } from '@/lib/utils';
import type { TaskResponseDto } from '@taskora/shared';

interface CalendarTaskRowProps {
  task: TaskResponseDto;
  onToggleComplete: (task: TaskResponseDto) => void;
  /** 键盘 Selection 停留时高亮（aria-selected）。 */
  selected?: boolean;
  onRowClick?: () => void;
}

export function CalendarTaskRow({ task, onToggleComplete, selected = false, onRowClick }: CalendarTaskRowProps) {
  const { t } = useTranslation();
  const completed = task.status === 'COMPLETED';
  const cancelled = task.status === 'CANCELLED';
  // 已了结（完成或取消）：标题置灰弱化；取消另加删除线（ADR 0006）。
  const settled = completed || cancelled;

  return (
    <div
      aria-selected={selected || undefined}
      className={cn(
        'group/taskrow flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent/60',
        selected && 'bg-accent',
      )}
    >
      <TaskCheckbox
        checked={completed}
        cancelled={cancelled}
        onToggle={() => onToggleComplete(task)}
        className="h-3 w-3"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRowClick?.();
        }}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-xs leading-4 text-foreground',
          settled && 'text-muted-foreground',
          cancelled && 'line-through',
        )}
        title={task.title}
      >
        {task.title || t('common:empty')}
      </button>
    </div>
  );
}
