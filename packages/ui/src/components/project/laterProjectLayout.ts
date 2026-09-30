import { calendarDateKey, type LaterProjectKind, type ProjectResponseDto } from '@taskora/shared';

export interface LaterProjectGroups {
  /** 未来计划日期的项目：按计划日期升序，同日按 sortOrder。 */
  scheduled: ProjectResponseDto[];
  /** Someday 项目：按 sortOrder。 */
  someday: ProjectResponseDto[];
}

export function groupLaterProjects(
  projects: ProjectResponseDto[],
  kindOf: (project: ProjectResponseDto) => LaterProjectKind | null,
  legacyTimeZone = 'UTC',
): LaterProjectGroups {
  const scheduled: ProjectResponseDto[] = [];
  const someday: ProjectResponseDto[] = [];
  for (const project of projects) {
    const kind = kindOf(project);
    if (kind === 'scheduled') scheduled.push(project);
    else if (kind === 'someday') someday.push(project);
  }
  const dayOf = (p: ProjectResponseDto) => calendarDateKey(p.scheduledDate!, legacyTimeZone);
  scheduled.sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || a.sortOrder - b.sortOrder);
  someday.sort((a, b) => a.sortOrder - b.sortOrder);
  return { scheduled, someday };
}
