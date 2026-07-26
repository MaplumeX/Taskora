import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { TaskResponseDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { taskKeys, useTaskQuery, useUpdateTask } from '@/lib/hooks/useTasks';
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: liveTask } = useTaskQuery(task.id);
  const current = liveTask ?? task;
  const completed = current.status === 'COMPLETED';
  const [exiting, setExiting] = React.useState(false);
  const expanded = selectionState === 'expanded';

  const updateTask = useUpdateTask();
  const [searchParams] = useSearchParams();
  const [title, setTitle] = React.useState(current.title);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  // Keep local title in sync with the server value when it changes externally.
  React.useEffect(() => {
    setTitle(current.title);
  }, [current.title]);

  // Auto-focus + select title when this row was expanded via the "add task" flow.
  React.useEffect(() => {
    if (!expanded) return;
    const expandId = searchParams.get('expand');
    if (expandId === task.id && current.title === '') {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [expanded, searchParams, task.id, current.title]);

  const commitTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== current.title) {
      updateTask.mutate(
        { id: task.id, data: { title: trimmed } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          },
          onError: () => toast.error(t('common:saveFailed')),
        },
      );
    } else {
      setTitle(current.title);
    }
  };

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

        {expanded ? (
          <Input
            ref={titleInputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            placeholder={t('task:newTaskPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setTitle(current.title);
                e.currentTarget.blur();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'flex-1 border-0 px-0 text-sm font-medium shadow-none focus-visible:ring-0',
              completed && 'text-muted-foreground line-through',
            )}
          />
        ) : (
          <span
            className={cn(
              'flex-1 truncate text-left text-sm transition-colors',
              completed
                ? 'text-muted-foreground line-through'
                : current.title
                  ? 'text-foreground'
                  : 'text-muted-foreground',
            )}
          >
            {current.title || t('task:newTaskPlaceholder')}
          </span>
        )}

        <div className="flex items-center gap-2">
          {current.tags && current.tags.length > 0 && (
            <div className="hidden items-center gap-1 sm:flex">
              {current.tags.slice(0, 5).map((tag) => (
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
          <TaskDateBadge scheduledDate={current.scheduledDate} />
          <TaskDueDateBadge dueDate={current.dueDate} />

          {!expanded && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#CC4444] opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onTrash();
              }}
              aria-label={t('task:moveToTrash')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {expanded && <TaskRowExpanded task={task} current={current} />}
    </div>
  );
}