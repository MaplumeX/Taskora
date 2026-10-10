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
import type { FeedView, TaskFeedItem } from '@taskora/shared';

import { EmptyState } from '@/components/common/EmptyState';
import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

interface Props {
  view: Extract<FeedView, 'deadlines' | 'repeating'>;
  /** 页面路由（标题图标）。 */
  nav: string;
  title: string;
  emptyHint: string;
}

/**
 * 只读顺序的平铺 feed 页（Deadlines / Repeating 等隐藏列表）：顺序由 feed
 * 决定，不分组、不可拖拽排序；行可勾选、展开、参与键盘 Selection。
 */
export function FlatFeedPage({ view, nav, title, emptyHint }: Props) {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery(view);
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
              item,
            }
          : {
              id: item.id,
              kind: 'project' as const,
              tagIds: item.tags.map((tag) => tag.id),
              item,
            },
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
      <PageHeading nav={nav}>{title}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : visible.length === 0 ? (
        <EmptyState hint={filtering ? t('tag:filterEmpty') : emptyHint} />
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
