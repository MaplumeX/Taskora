import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedItem } from '@taskora/shared';

import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { useFeedQuery } from '@taskora/api';
import {
  selectionStateOf,
  useCompleteTask,
  useSelectionScope,
  useUncancelTask,
  useUncompleteTask,
} from '@taskora/api';
import { useProjectsQuery } from '@taskora/api';
import { useAreasQuery } from '@taskora/api';
import { useTaskRowSelection } from '@taskora/api';
import { groupLogbookItems } from '@taskora/api';
import { toast } from 'sonner';

export default function Logbook() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('logbook');
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const uncancelTask = useUncancelTask();
  const {
    selectedIds,
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

  const groups = useMemo(() => groupLogbookItems(items, new Date()), [items]);

  // 注册可遍历行（Logbook 为已了结任务行：完成或取消）。
  const rows = useMemo(
    () =>
      items
        .filter((item) => item.type === 'task')
        .map((item) => ({
          id: item.id,
          kind: 'task' as const,
          completed: item.status === 'COMPLETED',
          cancelled: item.status === 'CANCELLED',
        })),
    [items],
  );
  useSelectionScope(rows);

  const toggleComplete = (item: FeedItem) => {
    if (item.type !== 'task') return;
    // 撤销了结：已完成 → 重开；已取消 → 撤销取消（story 15）。
    if (item.status === 'CANCELLED') uncancelTask.mutate(item.id);
    else if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  const renderGroup = (label: string, group: FeedItem[], isFirst: boolean) => {
    if (group.length === 0) return null;
    return (
      <div key={label} className="flex flex-col gap-1">
        {!isFirst && <div className="mx-2 mt-2 border-t border-border/40" />}
        <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">
          {label}
        </h2>
        {group.map((item) => {
          const isTask = item.type === 'task';
          const taskItem = item as { projectId: string | null; areaId: string | null };
          const selectionState = isTask
            ? selectionStateOf(selectedIds, expandedId, item.id)
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
              showScheduledBadge={false}
              showSettledDate
            />
          );
        })}
      </div>
    );
  };

  const hasAny = groups.length > 0;

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t('nav:logbook')}</h1>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : !hasAny ? (
        <p className="py-8 text-center font-display text-base font-semibold text-muted-foreground">
          {t('task:logbookEmpty')}
        </p>
      ) : (
        groups.map((group, i) => renderGroup(group.label, group.items, i === 0))
      )}
    </div>
  );
}