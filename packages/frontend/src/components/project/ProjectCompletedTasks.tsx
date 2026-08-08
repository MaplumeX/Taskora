import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MoreHorizontal, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { HeadingStatus, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTasksQuery, useUncompleteTask } from '@/lib/hooks/useTasks';
import {
  useProjectHeadingsQuery,
  useUnarchiveProjectHeading,
} from '@/lib/hooks/useProjectHeadings';
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
  const { data: allHeadings = [] } = useProjectHeadingsQuery(projectId, {
    includeArchived: true,
  });
  const expanded = useProjectUiPrefsStore(
    (s) => s.completedPanelExpanded[projectId] ?? false,
  );
  const setCompletedPanelExpanded = useProjectUiPrefsStore(
    (s) => s.setCompletedPanelExpanded,
  );
  const uncompleteTask = useUncompleteTask();
  const unarchiveHeading = useUnarchiveProjectHeading(projectId);

  const completedTasks = useMemo(
    () =>
      mixedTasks
        .filter((t) => t.status === TaskStatus.COMPLETED && t.trashedAt === null)
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? 0).getTime() -
            new Date(a.completedAt ?? 0).getTime(),
        ),
    [mixedTasks],
  );

  const archivedHeadings = useMemo(
    () => allHeadings.filter((h) => h.status === HeadingStatus.COMPLETED),
    [allHeadings],
  );

  // Partition completed tasks: those under an archived heading vs. flat.
  const { groupedTasks, flatTasks } = useMemo(() => {
    const archivedHeadingIds = new Set(archivedHeadings.map((h) => h.id));
    const grouped: Record<string, TaskResponseDto[]> = {};
    const flat: TaskResponseDto[] = [];
    for (const task of completedTasks) {
      if (task.headingId && archivedHeadingIds.has(task.headingId)) {
        if (!grouped[task.headingId]) grouped[task.headingId] = [];
        grouped[task.headingId].push(task);
      } else {
        flat.push(task);
      }
    }
    return { groupedTasks: grouped, flatTasks: flat };
  }, [completedTasks, archivedHeadings]);

  // Loading or error: silently hide (don't block the active task area).
  if (isLoading || isError) return null;

  // No completed tasks and no archived headings: hide the entire panel.
  if (completedTasks.length === 0 && archivedHeadings.length === 0) return null;

  const handleToggle = (task: TaskResponseDto) => {
    uncompleteTask.mutate(task.id, {
      onError: () => toast.error(t('common:operationFailed')),
    });
  };

  const handleUnarchive = (headingId: string) => {
    unarchiveHeading.mutate(headingId, {
      onSuccess: () => toast.success(t('unarchiveSuccess')),
      onError: () => toast.error(t('unarchiveFailed')),
    });
  };

  const totalCount = completedTasks.length + archivedHeadings.length;

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
        <span className="text-xs">{totalCount}</span>
      </button>

      {expanded && (
        <div className="flex flex-col">
          {archivedHeadings.map((heading) => {
            const tasks = groupedTasks[heading.id] ?? [];
            return (
              <div key={heading.id} className="mt-2">
                <div className="group flex h-10 items-center gap-1.5 border-b border-border pt-2">
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold tracking-wide text-muted-foreground">
                    {heading.title || t('headingPlaceholder')}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('headingActions')}
                        className="h-7 w-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={unarchiveHeading.isPending}
                        onSelect={() => handleUnarchive(heading.id)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('unarchive')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-col">
                  {tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggleComplete={() => handleToggle(task)}
                    />
                  ))}

                </div>
              </div>
            );
          })}
          {flatTasks.map((task) => (
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