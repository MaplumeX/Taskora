import { feedSortKey, sortByEffectivePosition } from '@taskora/api';
import {
  calendarDateKey,
  type FeedItem,
  type LaterItemKind,
  type LaterProjectKind,
  type ProjectResponseDto,
} from '@taskora/shared';

export interface LaterProjectGroups {
  /** 未来计划日期的项目：按计划日期升序，同日按 Position（与侧边栏同序）。 */
  scheduled: ProjectResponseDto[];
  /** Someday 项目：按 Position。 */
  someday: ProjectResponseDto[];
}

export function groupLaterProjects(
  projects: ProjectResponseDto[],
  kindOf: (project: ProjectResponseDto) => LaterProjectKind | null,
  legacyTimeZone = 'UTC',
): LaterProjectGroups {
  const scheduled: ProjectResponseDto[] = [];
  const someday: ProjectResponseDto[] = [];
  for (const project of sortByEffectivePosition(projects)) {
    const kind = kindOf(project);
    if (kind === 'scheduled') scheduled.push(project);
    else if (kind === 'someday') someday.push(project);
  }
  const dayOf = (p: ProjectResponseDto) => calendarDateKey(p.scheduledDate!, legacyTimeZone);
  // 稳定排序：同日保持上面的 Position 顺序
  scheduled.sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
  return { scheduled, someday };
}

export interface LaterItemGroups {
  /** 未来计划日期的项目与任务：按计划日期升序，同日按 feed 顺序（同 Upcoming）。 */
  scheduled: FeedItem[];
  /** Someday 项目与任务：按 feed 顺序混排（同 Someday 视图）。 */
  someday: FeedItem[];
}

/**
 * 区域页的稍后项（Later Item）：稍后项目与稍后任务混排进「计划」/「某天」两节。
 * 顺序键为 feed 混排键（任务 Position、项目 Feed Position）。
 */
export function groupLaterItems(
  items: FeedItem[],
  kindOf: (item: FeedItem) => LaterItemKind | null,
  legacyTimeZone = 'UTC',
): LaterItemGroups {
  const sorted = items
    .map((item) => ({ item, key: feedSortKey(item) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.item.id < b.item.id ? -1 : 1))
    .map(({ item }) => item);
  const scheduled: FeedItem[] = [];
  const someday: FeedItem[] = [];
  for (const item of sorted) {
    const kind = kindOf(item);
    if (kind === 'scheduled') scheduled.push(item);
    else if (kind === 'someday') someday.push(item);
  }
  const dayOf = (item: FeedItem) => calendarDateKey(item.scheduledDate!, legacyTimeZone);
  // 稳定排序：同日保持上面的 feed 顺序
  scheduled.sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
  return { scheduled, someday };
}
