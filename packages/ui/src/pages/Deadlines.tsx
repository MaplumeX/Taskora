import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  selectionStateOf,
  useAreasQuery,
  useCompleteTask,
  useEffectiveTags,
  useFeedQuery,
  useProjectsQuery,
  useSelectionScope,
  useTaskRowSelection,
  useUncompleteTask,
} from '@taskora/api';
import type { TaskFeedItem } from '@taskora/shared';

import { EmptyState } from '@/components/common/EmptyState';
import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

/**
 * Deadlines（对齐 Things 3 的隐藏列表）：所有带截止日期的未了结任务与项目，
 * 按截止日期升序（逾期在最前，顺序由 feed 决定）。只从 Quick Find 进入；
 * 平铺、不分组、不可拖拽排序。行上照常显示截止日期倒计时与计划日期标记。
 */
export default function Deadlines() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('deadlines');
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const { selectedIds, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a.title])), [areas]);

  const rows = useMemo(
    () =>
      visible.map((item) =>
        item.type === 'task'
          ? {
              id: item.id,
              kind: 'task' as const,
              completed: item.status === 'COMPLETED',
              cancelled: item.status === 'CANCELLED',
              tagIds: item.tags.map((tag) => tag.id),
            }
          : { id: item.id, kind: 'project' as const, tagIds: item.tags.map((tag) => tag.id) },
      ),
    [visible],
  );
  useSelectionScope(rows);

  const toggleComplete = (item: TaskFeedItem) => {
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/deadlines">{t('nav:deadlines')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : visible.length === 0 ? (
        <EmptyState hint={filtering ? t('tag:filterEmpty') : t('task:deadlinesEmpty')} />
      ) : (
        <div className="flex flex-col gap-1" onClick={handleBlankClick}>
          {visible.map((item) => {
            const isTask = item.type === 'task';
            return (
              <FeedItemRow
                key={`${item.type}:${item.id}`}
                item={item}
                projectTitle={isTask && item.projectId ? projectMap[item.projectId] : undefined}
                areaTitle={isTask && item.areaId ? areaMap[item.areaId] : undefined}
                selectionState={selectionStateOf(selectedIds, expandedId, item.id)}
                {...(isTask
                  ? {
                      onToggleComplete: () => toggleComplete(item),
                      onRowClick: () => handleRowClick(item.id),
                    }
                  : {})}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
