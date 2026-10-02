import { sortByEffectivePosition } from '@taskora/api';
import { calendarDateKey, type LaterProjectKind, type ProjectResponseDto } from '@taskora/shared';

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
