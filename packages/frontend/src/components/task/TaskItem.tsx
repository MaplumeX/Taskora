import * as React from 'react';
import { Trash2 } from 'lucide-react';

import type { TaskResponseDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskDateBadge } from './TaskDateBadge';
import { TaskDueDateBadge } from './TaskDueDateBadge';
import { TaskRowExpanded } from './TaskRowExpanded';
import type { SelectionState } from '@/lib/hooks/useTaskRowSelection';

interface Props {
  task: TaskResponseDto;
  projectTitle?: string;
  areaTitle?: string;
  selectionState?: SelectionState;
  onToggleComplete: () => void;
  onRowClick?: () => void;
  onTrash: () => void;
}

export function TaskItem({
  task,
  projectTitle,
  areaTitle,
  selectionState = 'idle',
  onToggleComplete,
  onRowClick,
  onTrash,
}: Props) {
  const completed = task.status === 'COMPLETED';
  const [exiting, setExiting] = React.useState(false);
  const expanded = selectionState === 'expanded';

  const handleToggle = () => {
    if (!completed) {
      setExiting(true);
      window.setTimeout(onToggleComplete, 350);
    } else {
      onToggleComplete();
    }
  };

  const tag = projectTitle ?? areaTitle;

  return (
    <div
      className={cn(
        'group flex flex-col transition-colors',
        selectionState === 'selected' && 'bg-muted/60',
        selectionState === 'expanded' && 'bg-muted/60',
      )}
    >
      <div
        className={cn(
          'flex h-12 items-center gap-3 px-2 transition-opacity',
          exiting && 'task-complete-anim',
        )}
        onClick={(e) => {
          if (!onRowClick) return;
          e.stopPropagation();
          onRowClick();
        }}
        role={onRowClick ? 'button' : undefined}
        tabIndex={onRowClick ? 0 : undefined}
      >
        <TaskCheckbox checked={completed} onToggle={handleToggle} />

        <span
          className={cn(
            'flex-1 truncate text-left text-sm transition-colors',
            completed ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {task.title}
        </span>

        <div className="flex items-center gap-2">
          {task.tags && task.tags.length > 0 && (
            <div className="hidden items-center gap-1 sm:flex">
              {task.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  title={tag.title}
                />
              ))}
            </div>
          )}
          {tag && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{tag}</span>
          )}
          <TaskDateBadge scheduledDate={task.scheduledDate} />
          <TaskDueDateBadge dueDate={task.dueDate} />

          {!expanded && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#CC4444] opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onTrash();
              }}
              aria-label="移到废纸篓"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {expanded && <TaskRowExpanded task={task} />}
    </div>
  );
}