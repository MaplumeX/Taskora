/**
 * 键盘编辑动作的纯函数：计划 / 截止日期的步进（⌃] ⌃[ / ⌃. ⌃,）与「在父列表中
 * 显示」（⌘L）的目标路由。日期均为账号时区的日期键（YYYY-MM-DD）。
 */

import { addCalendarDays, ScheduledType, TaskBucket } from '@taskora/shared';
import { toDateKey, type SelectionRowItem } from '@taskora/api';

type DateFields = Pick<SelectionRowItem, 'scheduledType' | 'scheduledDate' | 'dueDate'>;

/**
 * 计划日期步进 days 天。已过的计划日期按今天对待（CONTEXT.md「计划日期」），
 * 无计划 / Someday 从今天起算；结果不早于今天。无变化返回 null。
 */
export function shiftedStart(item: DateFields, days: number, today: string) {
  const dated = item.scheduledType === ScheduledType.DATE && item.scheduledDate != null;
  const stored = dated ? toDateKey(item.scheduledDate!) : null;
  const base = stored && stored > today ? stored : today;
  let next = addCalendarDays(base, days);
  if (next < today) next = today;
  if (next === stored) return null;
  return { scheduledType: ScheduledType.DATE, scheduledDate: next };
}

/**
 * 截止日期步进 days 天：有截止日期的在原值上加减（可退到过去，截止日期可
 * 逾期）；没有的从今天起算，且不落到过去。无变化返回 null。
 */
export function shiftedDeadline(item: DateFields, days: number, today: string) {
  const stored = item.dueDate ? toDateKey(item.dueDate) : null;
  let next = addCalendarDays(stored ?? today, days);
  if (!stored && next < today) next = today;
  if (next === stored) return null;
  return { dueDate: next };
}

/**
 * 「在父列表中显示」的目标：任务 → 所属项目 / 区域；无归属的按计划落到
 * Today / Upcoming / Someday / Anytime / Inbox。项目 → 所属区域；无区域的
 * 项目没有父列表，返回 null。
 */
export function parentRouteFor(
  kind: 'task' | 'project',
  item: SelectionRowItem,
  today: string,
): string | null {
  if (kind === 'project') return item.areaId ? `/areas/${item.areaId}` : null;
  if (item.projectId) return `/projects/${item.projectId}`;
  if (item.areaId) return `/areas/${item.areaId}`;
  if (item.scheduledType === ScheduledType.DATE && item.scheduledDate != null) {
    return toDateKey(item.scheduledDate) <= today ? '/today' : '/upcoming';
  }
  if (item.scheduledType === ScheduledType.SOMEDAY) return '/someday';
  return item.bucket === TaskBucket.ANYTIME ? '/anytime' : '/inbox';
}
