import {
  useCalendarDay,
  useEffectiveTags,
  useFeedQuery,
  useProjectsQuery,
  useAreasQuery,
  useTaskRowSelection,
  useRepeatPreviews,
  fromInputDateValue,
  i18n,
} from '@taskora/api';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedItem } from '@taskora/shared';
import type { RepeatPreview } from '@taskora/api';

import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { RepeatPreviewRow } from '@/components/task/RepeatPreviewRow';
import {
  selectionStateOf,
  useCompleteTask,
  useSelectionScope,
  useUncompleteTask,
} from '@taskora/api';
import { buildUpcomingLayout, type UpcomingDay } from '@taskora/api';
import { toast } from 'sonner';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

export default function Upcoming() {
  const calendarDay = useCalendarDay();
  const { t } = useTranslation();
  const { data: allItems = [], isLoading, isError } = useFeedQuery('upcoming');
  const effectiveTags = useEffectiveTags();
  const { visible: items, filtering, bar } = useTagFilter(allItems, effectiveTags.ofFeedItem);
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const previews = useRepeatPreviews();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const { selectedIds, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a.title])), [areas]);

  // 过滤时不显示下次预告（预告不是条目，没有 Tag）
  const layout = useMemo(
    () => buildUpcomingLayout(items, new Date(), filtering ? [] : previews),
    [items, previews, filtering, calendarDay],
  );

  // 注册可遍历行（按渲染顺序：本周每天，之后各月）。
  const rows = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        kind: item.type === 'task' ? ('task' as const) : ('project' as const),
        completed: item.type === 'task' ? item.status === 'COMPLETED' : false,
        cancelled: item.type === 'task' ? item.status === 'CANCELLED' : false,
        tagIds: item.tags.map((tag) => tag.id),
      })),
    [items],
  );
  useSelectionScope(rows);

  const toggleComplete = (item: FeedItem) => {
    if (item.type !== 'task') return;
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  // 本周按天分组时日期已在标题里，行上不再显示；月份分组只到月，行上补计划日期 chip。
  const renderItem = (item: FeedItem, showScheduledBadge = false) => {
    const isTask = item.type === 'task';
    const taskItem = item as { projectId: string | null; areaId: string | null };
    const selectionState = isTask ? selectionStateOf(selectedIds, expandedId, item.id) : 'idle';
    return (
      <FeedItemRow
        key={item.id}
        item={item}
        projectTitle={isTask && taskItem.projectId ? projectMap[taskItem.projectId] : undefined}
        areaTitle={isTask && taskItem.areaId ? areaMap[taskItem.areaId] : undefined}
        selectionState={selectionState}
        onToggleComplete={() => toggleComplete(item)}
        onRowClick={isTask ? () => handleRowClick(item.id) : undefined}
        showScheduledBadge={showScheduledBadge}
      />
    );
  };

  // 下次预告：只读、不进 Selection（rows 只注册真实条目）
  const renderPreview = (preview: RepeatPreview, showDate = false) => (
    <RepeatPreviewRow
      key={`preview:${preview.sourceTaskId}`}
      preview={preview}
      showDate={showDate}
      projectTitle={preview.projectId ? projectMap[preview.projectId] : undefined}
      areaTitle={preview.areaId ? areaMap[preview.areaId] : undefined}
    />
  );

  const renderDay = (day: UpcomingDay) => {
    const label = day.isTomorrow
      ? t('common:tomorrow')
      : new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(
          fromInputDateValue(day.dateKey),
        );

    return (
      <div key={day.dateKey} className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="text-title-1 tabular-nums leading-none">{day.numberLabel}</span>
          <span className="text-body tabular-nums text-muted-foreground">{label}</span>
          <div className="min-w-4 flex-1 border-t border-border" aria-hidden="true" />
        </div>
        {/* 空日期只留一行高度（仍是放置目标），避免一周空档把列表拉得过长。 */}
        <div className="flex min-h-6 flex-col">
          {day.items.map((item) => renderItem(item))}
          {day.previews.map((preview) => renderPreview(preview))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <PageHeading nav="/upcoming">{t('nav:upcoming')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {layout.week.map(renderDay)}
          {layout.later.map((month) => (
            <div key={`${month.year}-${month.month}`} className="flex flex-col gap-1">
              <h2 className="pt-4 text-title-2">
                {month.headingKind === 'range'
                  ? `${month.month}/${month.rangeStartDay}-${month.month}/${month.rangeEndDay}`
                  : new Intl.DateTimeFormat(
                      i18n.language,
                      month.showYear ? { month: 'long', year: 'numeric' } : { month: 'long' },
                    ).format(new Date(month.year, month.month - 1, 1))}
              </h2>
              <div className="flex min-h-12 flex-col gap-1">
                {month.days.flatMap((day) => [
                  ...day.items.map((item) => renderItem(item, true)),
                  ...day.previews.map((preview) => renderPreview(preview, true)),
                ])}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
