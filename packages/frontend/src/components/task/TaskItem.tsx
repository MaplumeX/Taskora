import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { TaskResponseDto } from '@taskora/shared';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { taskKeys, useTaskQuery, useUpdateTask } from '@/lib/hooks/useTasks';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskContextMenu } from './TaskContextMenu';
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
  showScheduledBadge?: boolean;
}

export function TaskItem({
  task,
  projectTitle,
  areaTitle,
  selectionState = 'idle',
  onToggleComplete,
  onRowClick,
  showScheduledBadge = true,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: liveTask } = useTaskQuery(task.id);
  const current = liveTask ?? task;
  const completed = current.status === 'COMPLETED';
  const [exiting, setExiting] = React.useState(false);
  const expanded = selectionState === 'expanded';

  const updateTask = useUpdateTask();
  const [title, setTitle] = React.useState(current.title);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  // Keep local title in sync with the server value when it changes externally.
  React.useEffect(() => {
    setTitle(current.title);
  }, [current.title]);

  // Auto-focus title on expand (caret at end, no full selection).
  React.useEffect(() => {
    if (!expanded) return;
    const el = titleInputRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(id);
  }, [expanded]);

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
      data-task-item
      className={cn(
        'group flex flex-col transition-colors',
        selectionState === 'selected' && 'bg-accent rounded-lg',
        selectionState === 'expanded' &&
          'rounded-xl border border-border/60 bg-card shadow-soft'
      )}
      onKeyDown={(e) => {
        if (!expanded || e.key !== 'Escape' || !onRowClick) return;
        const target = e.target as HTMLElement;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          e.preventDefault();
          onRowClick();
        }
      }}
    >
      <TaskContextMenu task={task} current={current}>
        <div
          className={cn(
            'flex h-10 items-center gap-3 rounded-lg px-2 transition-[opacity,background-color]',
            !expanded && 'hover:bg-accent/50',
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
                e.stopPropagation();
                e.currentTarget.blur();
              } else if (e.key === ' ') {
                e.stopPropagation();
              } else if (e.key === 'Escape') {
                setTitle(current.title);
                e.currentTarget.blur();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'flex-1 border-0 px-0 text-sm font-normal shadow-none focus-visible:ring-0',
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
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  title={tag.title}
                />
              ))}
            </div>
          )}
          {tag && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{tag}</span>
          )}
          {showScheduledBadge && (
            <TaskDateBadge scheduledDate={current.scheduledDate} />
          )}
          <TaskDueDateBadge dueDate={current.dueDate} />

        </div>
        </div>
      </TaskContextMenu>

      {expanded && <TaskRowExpanded task={task} current={current} />}
    </div>
  );
}