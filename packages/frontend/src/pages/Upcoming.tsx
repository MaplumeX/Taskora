import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedItem } from '@taskora/shared';

import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { useFeedQuery } from '@/lib/hooks/useFeed';
import {
  useCompleteTask,
  useUncompleteTask,
} from '@/lib/hooks/useTasks';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useTaskRowSelection } from '@/lib/hooks/useTaskRowSelection';
import { toDateKey } from '@/lib/utils/date';
import { i18n } from '@/i18n/config';
import { toast } from 'sonner';

export default function Upcoming() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('upcoming');
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
    const map = new Map<string, FeedItem[]>();
    for (const item of items) {
      if (!item.scheduledDate) continue;
      const key = toDateKey(item.scheduledDate);
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const toggleComplete = (item: FeedItem) => {
    if (item.type !== 'task') return;
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:upcoming')}</h1>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : grouped.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('task:upcomingEmpty')}</p>
      ) : (
        grouped.map(([dateKey, group]) => (
          <div key={dateKey} className="flex flex-col gap-1">
            <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">
              {new Intl.DateTimeFormat(i18n.language, {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              }).format(new Date(dateKey))}
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
        ))
      )}
    </div>
  );
}