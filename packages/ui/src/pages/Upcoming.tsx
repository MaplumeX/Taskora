import {
  useCalendarDay,
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

export default function Upcoming() {
  const calendarDay = useCalendarDay();
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('upcoming');
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

  const layout = useMemo(
    () => buildUpcomingLayout(items, new Date(), previews),
    [items, previews, calendarDay],
  );

  // 注册可遍历行（按渲染顺序：本周每天，之后各月）。
  const rows = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        kind: item.type === 'task' ? ('task' as const) : ('project' as const),
        completed: item.type === 'task' ? item.status === 'COMPLETED' : false,
        cancelled: item.type === 'task' ? item.status === 'CANCELLED' : false,
      })),
    [items],
  );
  useSelectionScope(rows);

  const toggleComplete = (item: FeedItem) => {
    if (item.type !== 'task') return;
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  const renderItem = (item: FeedItem) => {
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
        showScheduledBadge={false}
      />
    );
  };

  // 下次预告：只读、不进 Selection（rows 只注册真实条目）
  const renderPreview = (preview: RepeatPreview) => (
    <RepeatPreviewRow
      key={`preview:${preview.sourceTaskId}`}
      preview={preview}
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
          <span className="text-title-1 tabular-nums leading-none">
            {day.numberLabel}
          </span>
          <span className="text-body tabular-nums text-muted-foreground">{label}</span>
          <div className="min-w-4 flex-1 border-t border-border" aria-hidden="true" />
        </div>
        {/* 空日期只留一行高度（仍是放置目标），避免一周空档把列表拉得过长。 */}
        <div className="flex min-h-6 flex-col">
          {day.items.map(renderItem)}
          {day.previews.map(renderPreview)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <PageHeading nav="/upcoming">{t('nav:upcoming')}</PageHeading>
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
                  ...day.items.map(renderItem),
                  ...day.previews.map(renderPreview),
                ])}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
