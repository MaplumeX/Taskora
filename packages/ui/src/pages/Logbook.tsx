import {
  useCalendarDay,
  useEffectiveTags,
  useFeedQuery,
  useLogbookArchive,
  useProjectsQuery,
  useAreasQuery,
  useTaskRowSelection,
  groupLogbookItems,
  logbookArchiveCutoff,
  mergeLogbookArchive,
} from '@taskora/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedItem } from '@taskora/shared';

import { FeedItemRow } from '@/components/feed/FeedItemRow';
import {
  selectionStateOf,
  useCompleteTask,
  useSelectionScope,
  useUncancelTask,
  useUncompleteTask,
} from '@taskora/api';
import { toast } from 'sonner';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';
import { EmptyState } from '@/components/common/EmptyState';

export default function Logbook() {
  const calendarDay = useCalendarDay();
  const { t } = useTranslation();
  const { data: localItems = [], isLoading, isError } = useFeedQuery('logbook');
  // 归档部分（local-first-v3 issue 08）：副本不保留的旧条目，滚到底时从
  // hub 按页读取，只读。截止时刻在页面打开时定下。
  const [cutoff] = useState(() => logbookArchiveCutoff());
  const archive = useLogbookArchive(cutoff);
  const archivedPages = archive.data?.pages;
  const exhausted = !cutoff || (!!archivedPages && !archive.hasNextPage);
  const { items: allItems, archivedIds } = useMemo(
    () =>
      mergeLogbookArchive(
        localItems,
        archivedPages?.flatMap((page) => page.items) ?? [],
        cutoff,
        exhausted,
      ),
    [localItems, archivedPages, cutoff, exhausted],
  );
  const effectiveTags = useEffectiveTags();
  const { visible: items, filtering, bar } = useTagFilter(allItems, effectiveTags.ofFeedItem);
  const sentinel = useRef<HTMLDivElement>(null);
  const canLoadMore = !exhausted && !archive.isFetching && !archive.isError && !isLoading;
  const { fetchNextPage } = archive;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !canLoadMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, fetchNextPage]);
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const uncancelTask = useUncancelTask();
  const { selectedIds, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a.title])), [areas]);

  const groups = useMemo(() => groupLogbookItems(items, new Date()), [items, calendarDay]);

  // 注册可遍历行（Logbook 为已了结任务行：完成或取消；归档行只读，不参与）。
  const rows = useMemo(
    () =>
      items
        .filter((item) => item.type === 'task' && !archivedIds.has(item.id))
        .map((item) => ({
          id: item.id,
          kind: 'task' as const,
          completed: item.status === 'COMPLETED',
          cancelled: item.status === 'CANCELLED',
          tagIds: item.tags.map((tag) => tag.id),
          item,
        })),
    [items, archivedIds],
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
        <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">{label}</h2>
        {group.map((item) => {
          const isTask = item.type === 'task';
          // 归档行：只读（不在副本里，改不了）
          const readOnly = archivedIds.has(item.id);
          const taskItem = item as { projectId: string | null; areaId: string | null };
          const selectionState =
            isTask && !readOnly ? selectionStateOf(selectedIds, expandedId, item.id) : 'idle';
          return (
            <FeedItemRow
              key={item.id}
              item={item}
              projectTitle={
                isTask && taskItem.projectId ? projectMap[taskItem.projectId] : undefined
              }
              areaTitle={isTask && taskItem.areaId ? areaMap[taskItem.areaId] : undefined}
              selectionState={selectionState}
              onToggleComplete={readOnly ? undefined : () => toggleComplete(item)}
              onRowClick={isTask && !readOnly ? () => handleRowClick(item.id) : undefined}
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
      <PageHeading nav="/logbook">{t('nav:logbook')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : !hasAny && exhausted ? (
        <EmptyState hint={filtering ? t('tag:filterEmpty') : t('task:logbookEmpty')} />
      ) : (
        groups.map((group, i) => renderGroup(group.label, group.items, i === 0))
      )}
      {!exhausted && !isLoading && !isError && (
        <div ref={sentinel} className="py-4 text-center text-sm text-muted-foreground">
          {archive.isError ? (
            <>
              {t('task:logbookArchiveFailed')}{' '}
              <button
                type="button"
                className="underline"
                onClick={(event) => {
                  event.stopPropagation();
                  void fetchNextPage();
                }}
              >
                {t('task:logbookArchiveRetry')}
              </button>
            </>
          ) : archive.isFetching ? (
            t('common:loading')
          ) : null}
        </div>
      )}
    </div>
  );
}
