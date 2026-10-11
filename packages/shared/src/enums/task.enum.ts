/**
 * Start（开始状态，ADR 0024）：对应 Things 3 数据库的 `TMTask.start`。
 * 与计划日期一起决定 Task / Project 出现在哪个视图：有计划日期时恒为
 * ANYTIME；INBOX 只用于无归属、无日期的 Task，Project 不取 INBOX。
 */
export enum Start {
  INBOX = 'INBOX',
  ANYTIME = 'ANYTIME',
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
