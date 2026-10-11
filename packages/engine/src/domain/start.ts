/**
 * Start 推导（ADR 0024，CONTEXT：Start）：写入路径（Engine 后端 / REST
 * 服务）与合并后的修复（invariants.repairEntity）共用这一份。
 */

import { Start } from '@taskora/shared';

/**
 * Task：SOMEDAY 保留（调用方清除日期）；INBOX 只在无归属、无日期时成立，
 * 获得归属或日期即转为 ANYTIME（任何整理动作都会让任务离开 Inbox）；
 * 未指定时无归属、无日期落 Inbox，否则 Anytime。
 */
export function resolveTaskStart(
  start: unknown,
  scheduledDate: unknown,
  projectId: unknown,
  areaId: unknown,
): Start {
  if (start === Start.SOMEDAY) return Start.SOMEDAY;
  const loose = !projectId && !areaId && scheduledDate == null;
  if (start === Start.ANYTIME) return Start.ANYTIME;
  return loose ? Start.INBOX : Start.ANYTIME;
}

/** Project：SOMEDAY 或 ANYTIME，项目不停留在 Inbox。 */
export function resolveProjectStart(start: unknown): Start {
  return start === Start.SOMEDAY ? Start.SOMEDAY : Start.ANYTIME;
}
