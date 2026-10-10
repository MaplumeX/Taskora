import type { FeedItem, TaskFeedItem } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';
import { toDateKey, type RepeatPreview, type UpcomingLayout } from '@taskora/api';

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

/** 每个可见标题是一组；月份内按计划日期排，同一天保留 feed 的 Position 顺序。 */
export function upcomingGroups(layout: UpcomingLayout): UpcomingGroup[] {
  return [
    ...layout.week.map((day) => ({
      id: `date:${day.dateKey}`,
      scheduledDate: day.dateKey,
      items: day.items,
      previews: day.previews,
    })),
    ...layout.later.map((month) => {
      const monthKey = `${month.year}-${String(month.month).padStart(2, '0')}`;
      return {
        id: `month:${monthKey}`,
        scheduledDate: `${monthKey}-${String(month.rangeStartDay ?? 1).padStart(2, '0')}`,
        items: month.days.flatMap((day) => day.items),
        previews: month.days.flatMap((day) => day.previews),
      };
    }),
  ];
}

export function feedKey(item: Pick<FeedItem, 'type' | 'id'>) {
  return `${item.type}:${item.id}`;
}

/**
 * 和侧边栏一样：标题落到组首，行的上下半区决定前后插入，末尾空白落到组尾。
 * 被拖任务不在 items 里（Magic Plus 的草稿）时插入到落点，日期取该组。
 */
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
  // 月份内只重排同一天的任务，跨日期移动不能覆盖按日期排列的顺序。
  if (
    group.id === origin.groupId &&
    group.id.startsWith('month:') &&
    anchor?.scheduledDate &&
    origin.item.scheduledDate &&
    toDateKey(anchor.scheduledDate) !== toDateKey(origin.item.scheduledDate)
  ) {
    return null;
  }
  const rest = items.filter((item) => feedKey(item) !== activeKey);
  const afterAnchor = isRow ? target.edge === 'after' : !isHeader;
  const index = anchor
    ? rest.findIndex((item) => feedKey(item) === feedKey(anchor)) + (afterAnchor ? 1 : 0)
    : rest.length;
  const scheduledDate =
    group.id === origin.groupId ? origin.item.scheduledDate : group.scheduledDate;
  const current = items.find((item) => feedKey(item) === activeKey) ?? origin.item;
  const moved =
    current.scheduledDate === scheduledDate
      ? current
      : { ...current, scheduledType: ScheduledType.DATE, scheduledDate };
  const next = [...rest.slice(0, index), moved, ...rest.slice(index)];
  return next.every((item, i) => item === items[i]) ? null : next;
}
