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
import { fromInputDateValue } from '@/lib/utils/date';
import {
  buildUpcomingLayout,
  type UpcomingDay,
} from '@/lib/utils/upcomingLayout';
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

  const layout = useMemo(
    () => buildUpcomingLayout(items, new Date()),
    [items],
  );

  const toggleComplete = (item: FeedItem) => {
    if (item.type !== 'task') return;
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  const renderDay = (day: UpcomingDay) => {
    const label = day.isTomorrow
      ? t('common:tomorrow')
      : new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(
          fromInputDateValue(day.dateKey),
        );

    return (
      <div key={day.dateKey} className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-semibold tabular-nums leading-none">
            {day.numberLabel}
          </span>
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className="min-w-4 flex-1 border-t border-border" aria-hidden="true" />
        </div>
        <div className="flex min-h-12 flex-col gap-1">
          {day.items.map((item) => {
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
                showScheduledBadge={false}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:upcoming')}</h1>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {layout.week.map(renderDay)}
          {layout.later.map((month) => (
            <div key={`${month.year}-${month.month}`} className="flex flex-col gap-6">
              <h2 className="pt-4 text-lg font-semibold tracking-tight">
                {month.headingKind === 'range'
                  ? `${month.month}/${month.rangeStartDay}-${month.month}/${month.rangeEndDay}`
                  : new Intl.DateTimeFormat(
                      i18n.language,
                      month.showYear
                        ? { month: 'long', year: 'numeric' }
                        : { month: 'long' },
                    ).format(new Date(month.year, month.month - 1, 1))}
              </h2>
              <div className="flex min-h-12 flex-col gap-6">
                {month.days.map(renderDay)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
