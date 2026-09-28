import { calendarDateKey } from './calendar-date';
import { ProjectStatus } from './enums/project.enum';
import { ScheduledType } from './enums/task.enum';

/** Later Project 的两种状态：未来计划日期（「计划」）与 Someday。 */
export type LaterProjectKind = 'scheduled' | 'someday';

export interface LaterProjectFields {
  status: ProjectStatus | string;
  trashedAt: string | Date | null;
  scheduledType: ScheduledType | string;
  scheduledDate: string | Date | null;
}

/**
 * Later Project（稍后项目）判定的唯一来源（见 CONTEXT.md）：未了结、未进回收站，
 * 且为 Someday，或计划日期晚于账号时区的今天。日期为今天或已过即恢复活跃。
 *
 * `todayKey` 由调用方按账号时区给出；`legacyTimeZone` 用于解码旧的非零点时间戳。
 */
export function laterProjectKind(
  project: LaterProjectFields,
  todayKey: string,
  legacyTimeZone = 'UTC',
): LaterProjectKind | null {
  if (project.status !== ProjectStatus.ACTIVE || project.trashedAt != null) return null;
  if (project.scheduledType === ScheduledType.SOMEDAY) return 'someday';
  if (project.scheduledType !== ScheduledType.DATE || project.scheduledDate == null) return null;
  return calendarDateKey(project.scheduledDate, legacyTimeZone) > todayKey ? 'scheduled' : null;
}

export function isLaterProject(
  project: LaterProjectFields,
  todayKey: string,
  legacyTimeZone = 'UTC',
): boolean {
  return laterProjectKind(project, todayKey, legacyTimeZone) !== null;
}

/**
 * 这些视图里，稍后项目内的任务随父项目休眠、不出现。
 * Today / Upcoming 不受影响：有明确日期的任务照常按日期出现。
 */
export function hidesTasksInLaterProjects(view: string | undefined): boolean {
  return view === 'anytime' || view === 'someday';
}
