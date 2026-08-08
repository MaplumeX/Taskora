import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { HeadingStatus, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { useTasksQuery, useUncompleteTask } from '@/lib/hooks/useTasks';
import { useTaskRowSelection } from '@/lib/hooks/useTaskRowSelection';
import { useProjectHeadingsQuery } from '@/lib/hooks/useProjectHeadings';
import { useProjectUiPrefsStore } from '@/lib/stores/projectUiPrefs.store';
import { cn } from '@/lib/utils';
import { ProjectHeadingRow } from './ProjectHeadingRow';

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
  const { selectedId, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();

  // Keep server-returned order (sortOrder asc, createdAt desc) — do NOT re-sort
  // by completedAt. This preserves the pre-archive structural distribution.
  const completedTasks = useMemo(
    () => mixedTasks.filter((t) => t.status === TaskStatus.COMPLETED && t.trashedAt === null),
    [mixedTasks],
  );

  const archivedHeadings = useMemo(
    () => allHeadings.filter((h) => h.status === HeadingStatus.COMPLETED),
    [allHeadings],
  );

  // Partition: ungrouped tasks (no headingId or headingId not in archived set)
  // on top, then archived heading blocks (in sortOrder) with their grouped tasks.
  const { ungroupedTasks, groupedTasks } = useMemo(() => {
    const archivedHeadingIds = new Set(archivedHeadings.map((h) => h.id));
    const grouped: Record<string, TaskResponseDto[]> = {};
    const ungrouped: TaskResponseDto[] = [];
    for (const task of completedTasks) {
      if (task.headingId && archivedHeadingIds.has(task.headingId)) {
        if (!grouped[task.headingId]) grouped[task.headingId] = [];
        grouped[task.headingId].push(task);
      } else {
        ungrouped.push(task);
      }
    }
    return { ungroupedTasks: ungrouped, groupedTasks: grouped };
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

  const totalCount = completedTasks.length + archivedHeadings.length;

  const renderTask = (task: TaskResponseDto) => (
    <TaskItem
      key={task.id}
      task={task}
      selectionState={
        expandedId === task.id ? 'expanded' : selectedId === task.id ? 'selected' : 'idle'
      }
      onRowClick={() => handleRowClick(task.id)}
      onToggleComplete={() => handleToggle(task)}
    />
  );

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
        <div className="flex flex-col" onClick={handleBlankClick}>
          {ungroupedTasks.map(renderTask)}
          {archivedHeadings.map((heading) => {
            const tasks = groupedTasks[heading.id] ?? [];
            return (
              <section key={heading.id} className="mt-2">
                <ProjectHeadingRow heading={heading} />
                <div className="flex flex-col">
                  {tasks.map(renderTask)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}