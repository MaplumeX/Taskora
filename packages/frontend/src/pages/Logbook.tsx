import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedItem } from '@taskora/shared';

import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';
import { useFeedQuery } from '@/lib/hooks/useFeed';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
import {
  useCompleteTask,
  useUncompleteTask,
} from '@/lib/hooks/useTasks';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useTaskRowSelection } from '@/lib/hooks/useTaskRowSelection';
import { dayDiff } from '@/lib/utils/date';
import { toast } from 'sonner';

export default function Logbook() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('logbook');
  const showSkeleton = useDelayedLoading(isLoading);
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const {
    selectedId,
    expandedId,
    handleRowClick,
    handleBlankClick,
  } = useTaskRowSelection();

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a.title])),
    [areas],
  );

  const grouped = useMemo(() => {
    const today: FeedItem[] = [];
    const yesterday: FeedItem[] = [];
    const earlier: FeedItem[] = [];
    for (const item of items) {
      if (!item.completedAt) continue;
      const diff = dayDiff(item.completedAt, new Date());
      if (diff === 0) today.push(item);
      else if (diff === 1) yesterday.push(item);
      else earlier.push(item);
    }
    return { today, yesterday, earlier };
  }, [items]);

  const toggleComplete = (item: FeedItem) => {
    if (item.type !== 'task') return;
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  const renderGroup = (label: string, group: FeedItem[]) => {
    if (group.length === 0) return null;
    return (
      <div key={label} className="flex flex-col gap-1">
        <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">
          {label}
        </h2>
        {group.map((item) => {
          const isTask = item.type === 'task';
          const taskItem = item as { projectId: string | null; areaId: string | null };
          const selectionState =
            isTask
              ? expandedId === item.id ? 'expanded' : selectedId === item.id ? 'selected' : 'idle'
              : 'idle';
          return (
            <FeedItemRow
              key={item.id}
              item={item}
              projectTitle={isTask && taskItem.projectId ? projectMap[taskItem.projectId] : undefined}
              areaTitle={isTask && taskItem.areaId ? areaMap[taskItem.areaId] : undefined}
              selectionState={selectionState}
              onToggleComplete={() => toggleComplete(item)}
              onRowClick={isTask ? () => handleRowClick(item.id) : undefined}
            />
          );
        })}
      </div>
    );
  };

  const hasAny =
    grouped.today.length + grouped.yesterday.length + grouped.earlier.length > 0;

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:logbook')}</h1>
      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : !hasAny ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('task:logbookEmpty')}</p>
      ) : (
        <>
          {renderGroup(t('common:today'), grouped.today)}
          {renderGroup(t('task:yesterday'), grouped.yesterday)}
          {renderGroup(t('task:earlier'), grouped.earlier)}
        </>
      )}
    </div>
  );
}