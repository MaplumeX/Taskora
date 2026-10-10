import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { HeadingStatus, TaskStatus } from '@taskora/shared';
import type { ProjectHeadingResponseDto, TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { SettledDateBadge } from '@/components/feed/SettledDateBadge';
import { useIsLogged, useTasksQuery, useUncancelTask, useUncompleteTask } from '@taskora/api';
import { useTaskRowSelection } from '@taskora/api';
import { useProjectHeadingsQuery } from '@taskora/api';
import { useProjectUiPrefsStore } from '@taskora/api';
import { cn } from '@/lib/utils';
import { ProjectHeadingRow } from './ProjectHeadingRow';

interface Props {
  projectId: string;
}

type SettledEntry =
  | { kind: 'task'; task: TaskResponseDto; at: string }
  | { kind: 'heading'; heading: ProjectHeadingResponseDto; tasks: TaskResponseDto[]; at: string };

/** ISO 时间串可直接按字典序比较；倒序，最近的在前。 */
function byRecentFirst<T>(at: (item: T) => string) {
  return (a: T, b: T) => at(b).localeCompare(at(a));
}

export function ProjectSettledTasks({ projectId }: Props) {
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
  const uncancelTask = useUncancelTask();
  const { selectedId, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();
  const isLogged = useIsLogged();

  // 口径：已了结（完成 + 取消），与 taskCompletedCount 统计一致（ADR 0006）；
  // 尚未移入 Logbook 的还留在上方任务列表里（Logging Mode），这里不重复。
  const settledTasks = useMemo(
    () =>
      mixedTasks.filter(
        (t) =>
          (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CANCELLED) &&
          t.trashedAt === null &&
          isLogged(t),
      ),
    [mixedTasks, isLogged],
  );

  const archivedHeadings = useMemo(
    () => allHeadings.filter((h) => h.status === HeadingStatus.COMPLETED),
    [allHeadings],
  );

  // 同 Things：已了结任务与已归档分组混排，按了结时间倒序（任务看 completedAt 即了结时间，
  // 分组看归档时间）；分组下的任务跟随分组，组内同样倒序。同一时刻保持原列表顺序。
  const entries = useMemo(() => {
    const archivedHeadingIds = new Set(archivedHeadings.map((h) => h.id));
    const grouped: Record<string, TaskResponseDto[]> = {};
    const result: SettledEntry[] = [];
    for (const task of settledTasks) {
      if (task.headingId && archivedHeadingIds.has(task.headingId)) {
        (grouped[task.headingId] ??= []).push(task);
      } else {
        result.push({ kind: 'task', task, at: task.completedAt ?? '' });
      }
    }
    for (const heading of archivedHeadings) {
      const tasks = (grouped[heading.id] ?? []).sort(byRecentFirst((t) => t.completedAt ?? ''));
      result.push({ kind: 'heading', heading, tasks, at: heading.completedAt ?? '' });
    }
    return result.sort(byRecentFirst((e) => e.at));
  }, [settledTasks, archivedHeadings]);

  // Loading or error: silently hide (don't block the active task area).
  if (isLoading || isError) return null;

  // No settled tasks and no archived headings: hide the entire panel.
  if (settledTasks.length === 0 && archivedHeadings.length === 0) return null;

  const handleToggle = (task: TaskResponseDto) => {
    // 撤销了结：已完成 → 重开；已取消 → 撤销取消。
    const mutation = task.status === TaskStatus.CANCELLED ? uncancelTask : uncompleteTask;
    mutation.mutate(task.id, {
      onError: () => toast.error(t('common:operationFailed')),
    });
  };

  const totalCount = settledTasks.length + archivedHeadings.length;

  const renderTask = (task: TaskResponseDto) => (
    <TaskItem
      key={task.id}
      task={task}
      selectionState={
        expandedId === task.id ? 'expanded' : selectedId === task.id ? 'selected' : 'idle'
      }
      onRowClick={() => handleRowClick(task.id)}
      onToggleComplete={() => handleToggle(task)}
      settledDateBadge={
        task.completedAt ? (
          <SettledDateBadge date={task.completedAt} className="text-primary" />
        ) : undefined
      }
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
        <span>{t('settled')}</span>
        <span className="text-xs">{totalCount}</span>
      </button>

      {expanded && (
        <div className="flex flex-col" onClick={handleBlankClick}>
          {entries.map((entry) =>
            entry.kind === 'task' ? (
              renderTask(entry.task)
            ) : (
              <section key={entry.heading.id} className="mt-2">
                <ProjectHeadingRow heading={entry.heading} />
                <div className="flex flex-col">
                  {entry.tasks.map(renderTask)}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}