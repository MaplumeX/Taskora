/**
 * Bucket 推导（CONTEXT：Bucket）：由计划类型与归属推导。写入路径
 * （Engine 后端 / REST 服务）与合并后的修复（invariants.repairEntity）
 * 共用这一份。
 */

import { ProjectBucket, ScheduledType, TaskBucket } from '@taskora/shared';

/**
 * Task：DATE / SOMEDAY 在 Scheduled。NONE 下 Inbox 是「尚未整理」
 * （CONTEXT：Inbox）：有归属（项目 / 区域）即离开 Inbox 落 Anytime；
 * 无归属时 INBOX / ANYTIME 是用户选择，保留，未指定落 Inbox。
 */
export function resolveTaskBucket(
  bucket: unknown,
  scheduledType: unknown,
  projectId: unknown,
  areaId: unknown,
): TaskBucket {
  if (scheduledType === ScheduledType.DATE || scheduledType === ScheduledType.SOMEDAY) {
    return TaskBucket.SCHEDULED;
  }
  if (projectId || areaId) return TaskBucket.ANYTIME;
  return bucket === TaskBucket.ANYTIME ? TaskBucket.ANYTIME : TaskBucket.INBOX;
}

/**
 * Project：DATE / SOMEDAY 在 Scheduled，否则在 Anytime（项目不停留在
 * Inbox，NONE 下 Anytime 是唯一合法值）。
 */
export function resolveProjectBucket(scheduledType: unknown): ProjectBucket {
  return scheduledType === ScheduledType.DATE || scheduledType === ScheduledType.SOMEDAY
    ? ProjectBucket.SCHEDULED
    : ProjectBucket.ANYTIME;
}
