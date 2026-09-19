export enum TaskBucket {
  INBOX = 'INBOX',
  ANYTIME = 'ANYTIME',
  SCHEDULED = 'SCHEDULED',
}

export enum ScheduledType {
  NONE = 'NONE',
  DATE = 'DATE',
  SOMEDAY = 'SOMEDAY',
}

export enum TaskStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** 已了结（Settled）状态白名单：Logbook Entry 口径（ADR 0006）。前后端共用，防口径漂移。 */
export const SETTLED_TASK_STATUSES: readonly TaskStatus[] = [
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
];

/** 含已了结项的查询白名单（搜索 / Agent list_tasks 等含 completed=true 语义的路径）。 */
export const WITH_SETTLED_TASK_STATUSES: readonly TaskStatus[] = [
  TaskStatus.ACTIVE,
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
];
