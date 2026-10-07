/**
 * 分页快照（local-first-v3 issue 08）：bootstrap 按实体、按 id 游标分页，
 * 避免一次把整个账号读进内存、写进一个响应。
 *
 * 分页令牌是 base64url 的 JSON（hub 无状态，令牌里带 fence 与归档截止）：
 * 第一页之前固定 cursor fence，之后每页的 cursor 都是它。翻页期间的写
 * seq 都大于 fence，设备应用完快照后在 pull 里重放——某行在两页之间
 * 改变了归属阶段（任务了结）或被删除也不会永久漏掉。
 */

import { BadRequestException } from '@nestjs/common';
import { SETTLED_TASK_STATUSES, ProjectStatus, TaskStatus } from '@taskora/shared';
import { isTaskChildEntity, type SyncEntity } from '@taskora/engine';

/** 一页快照最多的实体行数。 */
export const BOOTSTRAP_PAGE_SIZE = 500;

/** 一页最多的 Compact 登记条数（只有 id，比实体行小得多）。 */
export const COMPACTED_PAGE_SIZE = 5000;

/**
 * 阶段顺序：先是结构（标签、区域、项目），再是未了结任务，最后是已了结
 * 任务与 Task 子实体（Subtask、Attachment）——新设备逐页渲染时，首屏
 * 需要的数据最先到。
 */
export const SNAPSHOT_PHASES: ReadonlyArray<{
  entity: SyncEntity;
  where?: Record<string, unknown>;
}> = [
  { entity: 'tag' },
  { entity: 'area' },
  { entity: 'project' },
  { entity: 'project-heading' },
  { entity: 'task', where: { status: TaskStatus.ACTIVE } },
  { entity: 'task', where: { status: { not: TaskStatus.ACTIVE } } },
  { entity: 'subtask' },
  { entity: 'attachment' },
];

export interface SnapshotToken {
  /** bootstrap 的 cursor fence。 */
  fence: number;
  /** SNAPSHOT_PHASES 的下标；等于其长度时为 Compact 登记阶段。 */
  phase: number;
  /** 本阶段已读到的最后一个 id（实体 id，或登记阶段的登记行 id）。 */
  after: string;
  /** 归档截止（ISO）；缺省为不省略归档任务。 */
  settledAfter?: string;
}

export function encodeSnapshotToken(token: SnapshotToken): string {
  return Buffer.from(JSON.stringify(token)).toString('base64url');
}

export function decodeSnapshotToken(raw: string): SnapshotToken {
  try {
    const token = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as SnapshotToken;
    if (
      Number.isSafeInteger(token.fence) &&
      Number.isSafeInteger(token.phase) &&
      token.phase >= 0 &&
      token.phase <= SNAPSHOT_PHASES.length &&
      typeof token.after === 'string' &&
      (token.settledAfter === undefined || parseCutoff(token.settledAfter) !== null)
    ) {
      return token;
    }
  } catch {
    // 落到下面的 400
  }
  throw new BadRequestException('无效的快照分页令牌');
}

/** ISO 时刻 → Date；无效返回 null。 */
export function parseCutoff(raw: string): Date | null {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 归档任务的 Prisma 条件（与 @taskora/engine 的 isArchivedTask 同一规则）：
 * 已了结且了结时间早于截止、不在 Trash、不属于进行中的项目。settledAt
 * 显式 not null：放进 NOT(...) 时，NULL 比较会让整个条件变成 NULL，把
 * 未设了结时间的已了结任务也排除掉。
 */
export function archivedTaskWhere(cutoff: Date): Record<string, unknown> {
  return {
    status: { in: [...SETTLED_TASK_STATUSES] },
    settledAt: { not: null, lt: cutoff },
    trashedAt: null,
    OR: [{ projectId: null }, { project: { status: ProjectStatus.COMPLETED } }],
  };
}

/** 某用户在快照里的行：归属 + 省略归档任务（及其子实体）。 */
export function snapshotOwnerWhere(
  entity: SyncEntity,
  userId: string,
  cutoff: Date | null,
): Record<string, unknown> {
  const tasks = cutoff ? { userId, NOT: archivedTaskWhere(cutoff) } : { userId };
  if (isTaskChildEntity(entity)) return { task: tasks };
  if (entity === 'task') return tasks;
  return { userId };
}
