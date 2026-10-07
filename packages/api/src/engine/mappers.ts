/**
 * Replica 行 → DTO 映射（单一事实来源，各域 Engine backend 共用）。
 *
 * 字段口径与 hub 侧 REST 序列化一致（settledAt → completedAt 承载
 * Settled At 语义，ADR 0006）；tagIds 数组经 tag index 解析为 Tag DTO
 * （已删除 Tag 的悬挂 id 被过滤）。
 */

import type { Positioned, ReplicaRow } from '@taskora/engine';
import {
  HeadingStatus,
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';
import type {
  AreaResponseDto,
  AttachmentResponseDto,
  ProjectHeadingResponseDto,
  ProjectResponseDto,
  RepeatRule,
  SubtaskResponseDto,
  TagResponseDto,
  TaskResponseDto,
} from '@taskora/shared';

/** 副本行的排序视图（domain 的 planReorder / positionAtEnd 等的输入）。 */
export function positionedRows(rows: readonly ReplicaRow[]): Array<Positioned & { id: string }> {
  return rows.map((row) => ({
    id: row.id,
    position: typeof row.fields.position === 'string' ? row.fields.position : null,
  }));
}

export const SETTLED_TASK_STATUSES = new Set<TaskStatus>([
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
]);

/**
 * Tag index：engine.list('tag') → id → TagResponseDto（各域 Engine
 * backend 共用；悬挂 id 的解析过滤由各 rowToDto 完成）。
 */
export async function tagIndexFor(engine: {
  list(entity: 'tag'): Promise<ReplicaRow[]>;
}): Promise<Map<string, TagResponseDto>> {
  const tags = await engine.list('tag');
  const index = new Map<string, TagResponseDto>();
  for (const row of tags) {
    index.set(row.id, tagRowToDto(row));
  }
  return index;
}

export function tagRowToDto(row: ReplicaRow): TagResponseDto {
  const f = row.fields;
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    color: (f.color as string) ?? '#3B82F6',
    position: typeof f.position === 'string' ? f.position : null,
    parentId: typeof f.parentId === 'string' ? f.parentId : null,
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

export function taskRowToDto(row: ReplicaRow, tags: Map<string, TagResponseDto>): TaskResponseDto {
  const f = row.fields;
  const tagIds = Array.isArray(f.tagIds) ? (f.tagIds as string[]) : [];
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    notes: (f.notes as string | null) ?? null,
    scheduledDate: (f.scheduledDate as string | null) ?? null,
    scheduledType: (f.scheduledType as ScheduledType) ?? ScheduledType.NONE,
    reminderTime: (f.reminderTime as string | null) ?? null,
    repeatRule: (f.repeatRule as RepeatRule | null) ?? null,
    repeatSourceId: (f.repeatSourceId as string | null) ?? null,
    dueDate: (f.dueDate as string | null) ?? null,
    bucket: (f.bucket as TaskBucket) ?? TaskBucket.INBOX,
    status: (f.status as TaskStatus) ?? TaskStatus.ACTIVE,
    // DTO 字段名保留 completedAt，承载 Settled At 语义（ADR 0006）。
    completedAt: (f.settledAt as string | null) ?? null,
    trashedAt: (f.trashedAt as string | null) ?? null,
    position: typeof f.position === 'string' ? f.position : null,
    projectId: (f.projectId as string | null) ?? null,
    headingId: (f.headingId as string | null) ?? null,
    areaId: (f.areaId as string | null) ?? null,
    tags: tagIds.map((id) => tags.get(id)).filter((t): t is TagResponseDto => t !== undefined),
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

export function subtaskRowToDto(row: ReplicaRow): SubtaskResponseDto {
  const f = row.fields;
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    status: (f.status as TaskStatus) ?? TaskStatus.ACTIVE,
    completedAt: (f.settledAt as string | null) ?? null,
    position: typeof f.position === 'string' ? f.position : null,
    taskId: (f.taskId as string) ?? '',
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

export function attachmentRowToDto(row: ReplicaRow): AttachmentResponseDto {
  const f = row.fields;
  return {
    id: row.id,
    taskId: (f.taskId as string) ?? '',
    name: (f.name as string) ?? '',
    mimeType: (f.mimeType as string | null) ?? 'application/octet-stream',
    size: typeof f.size === 'number' ? f.size : 0,
    blobHash: (f.blobHash as string) ?? '',
    position: typeof f.position === 'string' ? f.position : null,
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

/** 附件行 → 重复派生的复制来源（元数据原样，指向同一 Blob）。 */
export function attachmentSources(rows: readonly ReplicaRow[]) {
  return rows.map((row) => {
    const dto = attachmentRowToDto(row);
    return {
      id: dto.id,
      taskId: dto.taskId,
      name: dto.name,
      mimeType: dto.mimeType,
      size: dto.size,
      blobHash: dto.blobHash,
      position: dto.position ?? null,
    };
  });
}

export function projectRowToDto(
  row: ReplicaRow,
  tags: Map<string, TagResponseDto>,
  taskTotalCount: number,
  taskCompletedCount: number,
): ProjectResponseDto {
  const f = row.fields;
  const tagIds = Array.isArray(f.tagIds) ? (f.tagIds as string[]) : [];
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    notes: (f.notes as string | null) ?? null,
    areaId: (f.areaId as string | null) ?? null,
    position: typeof f.position === 'string' ? f.position : null,
    status: (f.status as ProjectStatus) ?? ProjectStatus.ACTIVE,
    bucket: (f.bucket as ProjectBucket) ?? ProjectBucket.ANYTIME,
    scheduledType: (f.scheduledType as ScheduledType) ?? ScheduledType.NONE,
    scheduledDate: (f.scheduledDate as string | null) ?? null,
    dueDate: (f.dueDate as string | null) ?? null,
    repeatRule: (f.repeatRule as RepeatRule | null) ?? null,
    repeatSourceId: (f.repeatSourceId as string | null) ?? null,
    completedAt: (f.completedAt as string | null) ?? null,
    trashedAt: (f.trashedAt as string | null) ?? null,
    tags: tagIds.map((id) => tags.get(id)).filter((t): t is TagResponseDto => t !== undefined),
    taskTotalCount,
    taskCompletedCount,
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

export function areaRowToDto(row: ReplicaRow, tags: Map<string, TagResponseDto>): AreaResponseDto {
  const f = row.fields;
  const tagIds = Array.isArray(f.tagIds) ? (f.tagIds as string[]) : [];
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    notes: (f.notes as string | null) ?? null,
    position: typeof f.position === 'string' ? f.position : null,
    tags: tagIds.map((id) => tags.get(id)).filter((t): t is TagResponseDto => t !== undefined),
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

export function projectHeadingRowToDto(row: ReplicaRow): ProjectHeadingResponseDto {
  const f = row.fields;
  return {
    id: row.id,
    projectId: (f.projectId as string) ?? '',
    title: (f.title as string) ?? '',
    position: typeof f.position === 'string' ? f.position : null,
    status: (f.status as HeadingStatus) ?? HeadingStatus.ACTIVE,
    completedAt: (f.completedAt as string | null) ?? null,
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}
