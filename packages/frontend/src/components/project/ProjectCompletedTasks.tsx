import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { cn } from '@/lib/utils';
import { useTasksQuery, useUncompleteTask } from '@/lib/hooks/useTasks';
import { useProjectUiPrefsStore } from '@/lib/stores/projectUiPrefs.store';

interface Props {
  projectId: string;
}

export function ProjectCompletedTasks({ projectId }: Props) {
  const { t } = useTranslation('project');
  const { data: mixedTasks = [], isLoading, isError } = useTasksQuery({
    projectId,
    completed: true,
  });
  const expanded = useProjectUiPrefsStore(
    (s) => s.completedPanelExpanded[projectId] ?? false,
  );
  const setCompletedPanelExpanded = useProjectUiPrefsStore(
    (s) => s.setCompletedPanelExpanded,
  );
  const uncompleteTask = useUncompleteTask();

  const completedTasks = useMemo(
    () =>
      mixedTasks
        .filter(
          (t) => t.status === TaskStatus.COMPLETED && t.trashedAt === null,
        )
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? 0).getTime() -
            new Date(a.completedAt ?? 0).getTime(),
        ),
    [mixedTasks],
  );

  // Loading or error: silently hide (don't block the active task area).
  if (isLoading || isError) return null;

  // No completed tasks: hide the entire panel.
  if (completedTasks.length === 0) return null;

  const handleToggle = (task: TaskResponseDto) => {
    uncompleteTask.mutate(task.id, {
      onError: () => toast.error(t('common:operationFailed')),
    });
  };

  return (
    <div className="flex flex-col gap-1 pt-4">
      <button
        type="button"
        onClick={() => setCompletedPanelExpanded(projectId, !expanded)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn('size-4 transition-transform', expanded && 'rotate-90')}
        />
        <span>{t('completed')}</span>
        <span className="text-xs">{completedTasks.length}</span>
      </button>

      {expanded && (
        <div className="flex flex-col">
          {completedTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggleComplete={() => handleToggle(task)}
            />
          ))}
        </div>
      )}
    </div>
  );
}