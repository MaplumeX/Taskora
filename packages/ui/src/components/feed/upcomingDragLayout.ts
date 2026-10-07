import type { FeedItem, TaskFeedItem } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';
import type { RepeatPreview, UpcomingLayout } from '@taskora/api';

export interface UpcomingGroup {
  id: string;
  scheduledDate: string;
  items: FeedItem[];
  previews: RepeatPreview[];
}

export interface UpcomingDragTarget {
  overKey: string;
  edge: 'before' | 'after';
}

/** 每个可见标题是一组；月份内按 feed 的 Position 排，具体日期仍保留在行上。 */
export function upcomingGroups(layout: UpcomingLayout, items: FeedItem[]): UpcomingGroup[] {
  return [
    ...layout.week.map((day) => ({
      id: `date:${day.dateKey}`,
      scheduledDate: day.dateKey,
      items: day.items,
      previews: day.previews,
    })),
    ...layout.later.map((month) => {
      const monthKey = `${month.year}-${String(month.month).padStart(2, '0')}`;
      const keys = new Set(month.days.flatMap((day) => day.items.map(feedKey)));
      return {
        id: `month:${monthKey}`,
        scheduledDate: `${monthKey}-${String(month.rangeStartDay ?? 1).padStart(2, '0')}`,
        items: items.filter((item) => keys.has(feedKey(item))),
        previews: month.days.flatMap((day) => day.previews),
      };
    }),
  ];
}

export function feedKey(item: Pick<FeedItem, 'type' | 'id'>) {
  return `${item.type}:${item.id}`;
}

/** 和侧边栏一样：标题落到组首，行的上下半区决定前后插入，末尾空白落到组尾。 */
export function moveUpcomingTask(
  items: FeedItem[],
  groups: UpcomingGroup[],
  origin: { item: TaskFeedItem; groupId: string },
  target: UpcomingDragTarget,
): FeedItem[] | null {
  const activeKey = feedKey(origin.item);
  if (target.overKey === activeKey) return null;
  const isRow = target.overKey.startsWith('task:');
  const isHeader = target.overKey.startsWith('header:');
  const groupId = target.overKey.replace(/^(header|container):/, '');
  const group = isRow
    ? groups.find((group) => group.items.some((item) => feedKey(item) === target.overKey))
    : groups.find((group) => group.id === groupId);
  if (!group) return null;

  const others = group.items.filter((item) => feedKey(item) !== activeKey);
  const anchor = isRow
    ? others.find((item) => feedKey(item) === target.overKey)
    : isHeader
      ? others[0]
      : others[others.length - 1];
  const rest = items.filter((item) => feedKey(item) !== activeKey);
  const afterAnchor = isRow ? target.edge === 'after' : !isHeader;
  const index = anchor
    ? rest.findIndex((item) => feedKey(item) === feedKey(anchor)) + (afterAnchor ? 1 : 0)
    : rest.length;
  const scheduledDate =
    group.id === origin.groupId ? origin.item.scheduledDate : group.scheduledDate;
  const current = items.find((item) => feedKey(item) === activeKey);
  if (!current) return null;
  const moved =
    current.scheduledDate === scheduledDate
      ? current
      : { ...current, scheduledType: ScheduledType.DATE, scheduledDate };
  const next = [...rest.slice(0, index), moved, ...rest.slice(index)];
  return next.every((item, i) => item === items[i]) ? null : next;
}
