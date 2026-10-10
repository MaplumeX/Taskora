import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  groupLogbookItems,
  selectionStateOf,
  useCalendarDay,
  useEffectiveTags,
  useFeedQuery,
  useSelectionScope,
  useTaskRowSelection,
} from '@taskora/api';

import { EmptyState } from '@/components/common/EmptyState';
import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

/**
 * Logged Projects（对齐 Things 3 的隐藏列表）：Logbook 中的项目，按了结时间
 * 分组（规则同 Logbook）。只从 Quick Find 进入；不含 Archived Logbook。
 */
export default function LoggedProjects() {
  const { t } = useTranslation();
  const calendarDay = useCalendarDay();
  const { data: logbook = [], isLoading, isError } = useFeedQuery('logbook');
  const items = useMemo(() => logbook.filter((item) => item.type === 'project'), [logbook]);
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);
  const { selectedIds, expandedId, handleBlankClick } = useTaskRowSelection();
  const groups = useMemo(() => groupLogbookItems(visible, new Date()), [visible, calendarDay]);

  const rows = useMemo(
    () =>
      visible.map((item) => ({
        id: item.id,
        kind: 'project' as const,
        completed: true,
        tagIds: item.tags.map((tag) => tag.id),
        item,
      })),
    [visible],
  );
  useSelectionScope(rows);

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <PageHeading nav="/logged-projects">{t('nav:loggedProjects')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : groups.length === 0 ? (
        <EmptyState hint={filtering ? t('tag:filterEmpty') : t('project:loggedProjectsEmpty')} />
      ) : (
        groups.map((group, index) => (
          <div key={group.key} className="flex flex-col gap-1">
            {index > 0 && <div className="mx-2 mt-2 border-t border-border/40" />}
            <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">
              {group.label}
            </h2>
            {group.items.map((item) => (
              <FeedItemRow
                key={item.id}
                item={item}
                selectionState={selectionStateOf(selectedIds, expandedId, item.id)}
                showScheduledBadge={false}
                showSettledDate
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
