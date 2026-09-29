/**
 * 合并后的确定性修复（跨字段不变量，.scratch/local-first-v3 issue 01）。
 *
 * 字段级 LWW 逐字段裁决：两台设备分别改了相关字段时，合并结果每个
 * 字段都「合法」、组合却可能违反业务规则（别的项目的分组、Someday
 * 任务带提醒、DATE 任务落在 Anytime……）。Sync Hub 在每次合并之后调用
 * repairEntity，把违反规则的字段纠正为规则允许的值，并以虚拟设备 0 的
 * 必胜时钟下发（与引用清洗同一机制），所有设备收敛到同一结果。
 *
 * 规则与 REST 服务写入时的规则一致（TasksService / ProjectsService /
 * SubtasksService）：冲突时「把状态收紧」的一方获胜——换项目清空分组、
 * 离开 DATE 清空提醒与重复规则。一致的状态返回空：修复只在真的冲突
 * 时发生。纯函数，设备与 hub 共用。
 */

import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';

import type { SyncEntity } from './entities';

/** 分组归属探针：返回分组所属项目 id；未知（尚未到达 / 已删除）返回 undefined。 */
export type HeadingProjectProbe = (headingId: string) => string | undefined;

/** 与 TasksService.resolveBucket 同一推导：NONE 下 INBOX / ANYTIME 是用户选择，保留。 */
export function resolveTaskBucket(
  bucket: unknown,
  scheduledType: unknown,
  projectId: unknown,
  areaId: unknown,
): TaskBucket {
  if (scheduledType === ScheduledType.DATE || scheduledType === ScheduledType.SOMEDAY) {
    return TaskBucket.SCHEDULED;
  }
  if (bucket === TaskBucket.INBOX || bucket === TaskBucket.ANYTIME) return bucket;
  return projectId || areaId ? TaskBucket.ANYTIME : TaskBucket.INBOX;
}

/**
 * 与 ProjectsService.resolveBucket 同一推导：DATE / SOMEDAY 在 Scheduled，
 * 否则在 Anytime（项目不停留在 Inbox，NONE 下 Anytime 是唯一合法值）。
 */
export function resolveProjectBucket(scheduledType: unknown): ProjectBucket {
  return scheduledType === ScheduledType.DATE || scheduledType === ScheduledType.SOMEDAY
    ? ProjectBucket.SCHEDULED
    : ProjectBucket.ANYTIME;
}

/**
 * 返回需要纠正的字段 → 值（空对象表示状态一致）。只看 fields 中出现的
 * 字段：部分字段集（如 hub 上缺列的旧数据）不会被凭空补全。
 */
export function repairEntity(
  entity: SyncEntity,
  fields: Record<string, unknown>,
  probe: HeadingProjectProbe = () => undefined,
): Record<string, unknown> {
  const fixes: Record<string, unknown> = {};
  const fix = (field: string, value: unknown) => {
    if (!(field in fields)) return;
    if (JSON.stringify(fields[field] ?? null) !== JSON.stringify(value ?? null)) {
      fixes[field] = value;
    }
  };
  const has = (field: string) => field in fields;

  switch (entity) {
    case 'task': {
      const type = fields.scheduledType;
      if (has('scheduledType')) {
        // R1：仅 DATE 任务可设提醒与重复规则（CONTEXT：Reminder / Repeat Rule）
        if (type !== ScheduledType.DATE) {
          fix('repeatRule', null);
          fix('reminderTime', null);
        }
        // R2：NONE / SOMEDAY 没有计划日期
        if (type === ScheduledType.NONE || type === ScheduledType.SOMEDAY) {
          fix('scheduledDate', null);
        }
        // R3：Bucket 由计划类型与归属推导
        if (has('bucket')) {
          fix('bucket', resolveTaskBucket(fields.bucket, type, fields.projectId, fields.areaId));
        }
      }
      // R4：分组必须属于任务所在项目（换项目清空分组）
      if (typeof fields.headingId === 'string' && has('projectId')) {
        const owner = probe(fields.headingId);
        if (owner !== undefined && owner !== fields.projectId) fix('headingId', null);
      }
      // R5：未了结没有了结时间
      if (fields.status === TaskStatus.ACTIVE) fix('settledAt', null);
      break;
    }
    case 'project': {
      const type = fields.scheduledType;
      if (has('scheduledType')) {
        if (type === ScheduledType.NONE || type === ScheduledType.SOMEDAY) {
          fix('scheduledDate', null);
        }
        if (has('bucket')) fix('bucket', resolveProjectBucket(type));
      }
      if (fields.status === ProjectStatus.ACTIVE) fix('completedAt', null);
      break;
    }
    case 'subtask': {
      if (fields.status === TaskStatus.ACTIVE) fix('settledAt', null);
      break;
    }
    default:
      break;
  }
  return fixes;
}
