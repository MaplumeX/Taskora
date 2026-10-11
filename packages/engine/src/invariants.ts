/**
 * 合并后的确定性修复（跨字段不变量，.scratch/local-first-v3 issue 01）。
 *
 * 字段级 LWW 逐字段裁决：两台设备分别改了相关字段时，合并结果每个
 * 字段都「合法」、组合却可能违反业务规则（别的项目的分组、Someday
 * 任务带日期、有归属的任务还在 Inbox……）。Sync Hub 在每次合并之后调用
 * repairEntity，把违反规则的字段纠正为规则允许的值，并以虚拟设备 0 的
 * 必胜时钟下发（与引用清洗同一机制），所有设备收敛到同一结果。
 *
 * 规则与写入路径共用 domain/ 的推导（Engine 后端与 REST 服务都调用）：
 * 冲突时「把状态收紧」的一方获胜——换项目清空分组、Someday 清空日期、
 * 没有日期清空提醒与重复规则（任务与项目）、整理过的任务离开 Inbox。一致的状态返回空：修复只在真的冲突
 * 时发生。纯函数，设备与 hub 共用。
 */

import { ProjectStatus, Start, TaskStatus } from '@taskora/shared';

import type { SyncEntity } from './entities';
import { resolveProjectStart, resolveTaskStart } from './domain/start';
import { tagParentCreatesCycle } from './domain/tags';

/** 分组归属探针：返回分组所属项目 id；未知（尚未到达 / 已删除）返回 undefined。 */
export type HeadingProjectProbe = (headingId: string) => string | undefined;

/** 父 Tag 探针：返回 Tag 当前的 parentId；未知返回 undefined。 */
export type TagParentProbe = (tagId: string) => string | null | undefined;

/** 修复时需要读的其他行（hub 预加载后传入）。 */
export interface RepairProbes {
  headingProject?: HeadingProjectProbe;
  tagParent?: TagParentProbe;
}

/**
 * 返回需要纠正的字段 → 值（空对象表示状态一致）。只看 fields 中出现的
 * 字段：部分字段集（如 hub 上缺列的旧数据）不会被凭空补全。id 是被
 * 修复行自己的 id（Tag 断环用）。
 */
/** Someday 优先：start 为 SOMEDAY 时日期清空，否则保留。 */
function scheduledDateAfterStart(fields: Record<string, unknown>): unknown {
  return fields.start === Start.SOMEDAY ? null : (fields.scheduledDate ?? null);
}

export function repairEntity(
  entity: SyncEntity,
  fields: Record<string, unknown>,
  probes: RepairProbes = {},
  id?: string,
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
      // 字段集里没有 scheduledDate 时不推断日期：按「未知」处理，不修
      const date = has('scheduledDate') ? scheduledDateAfterStart(fields) : undefined;
      if (date !== undefined) {
        // R1：Someday 没有计划日期（ADR 0024）
        fix('scheduledDate', date);
        // R2：仅有计划日期的任务可设提醒与重复规则（CONTEXT：Reminder / Repeat Rule）
        if (date === null) {
          fix('repeatRule', null);
          fix('reminderTime', null);
        }
      }
      // R3：Inbox 只收无归属、无日期的任务；整理过即 Anytime
      if (has('start') && date !== undefined) {
        fix('start', resolveTaskStart(fields.start, date, fields.projectId, fields.areaId));
      }
      // R4：分组必须属于任务所在项目（换项目清空分组）
      if (typeof fields.headingId === 'string' && has('projectId')) {
        const owner = probes.headingProject?.(fields.headingId);
        if (owner !== undefined && owner !== fields.projectId) fix('headingId', null);
      }
      // R5：未了结没有了结时间
      if (fields.status === TaskStatus.ACTIVE) fix('settledAt', null);
      break;
    }
    case 'project': {
      const date = has('scheduledDate') ? scheduledDateAfterStart(fields) : undefined;
      if (date !== undefined) {
        fix('scheduledDate', date);
        // R1：仅有计划日期的项目可设重复规则（recurring-projects spec）
        if (date === null) fix('repeatRule', null);
      }
      // 项目不停留在 Inbox
      if (has('start')) fix('start', resolveProjectStart(fields.start));
      if (fields.status === ProjectStatus.ACTIVE) fix('completedAt', null);
      break;
    }
    case 'subtask': {
      if (fields.status === TaskStatus.ACTIVE) fix('settledAt', null);
      break;
    }
    case 'tag': {
      // R1：Tag 树不成环（ADR-0016）。两台设备并发互设父 Tag 时，后合并
      // 的这一行回到顶层。
      if (id !== undefined && typeof fields.parentId === 'string') {
        const parentOf = probes.tagParent ?? (() => undefined);
        if (tagParentCreatesCycle(id, fields.parentId, parentOf)) fix('parentId', null);
      }
      break;
    }
    default:
      break;
  }
  return fixes;
}
