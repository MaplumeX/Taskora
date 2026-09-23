/**
 * Replica 行 → DTO 映射（单一事实来源，各域 Engine backend 共用）。
 *
 * 字段口径与 hub 侧 REST 序列化一致（settledAt → completedAt 承载
 * Settled At 语义，ADR 0006）；tagIds 数组经 tag index 解析为 Tag DTO
 * （已删除 Tag 的悬挂 id 被过滤）。
 */

import type { ReplicaRow } from '@taskora/engine';
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
  ProjectHeadingResponseDto,
  ProjectResponseDto,
  RepeatRule,
  SubtaskResponseDto,
  TagGroupResponseDto,
  TagResponseDto,
  TaskResponseDto,
} from '@taskora/shared';

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
    sortOrder: (f.sortOrder as number) ?? 0,
    tagGroupId: (f.tagGroupId as string | null) ?? null,
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
    dueDate: (f.dueDate as string | null) ?? null,
    bucket: (f.bucket as TaskBucket) ?? TaskBucket.INBOX,
    status: (f.status as TaskStatus) ?? TaskStatus.ACTIVE,
    // DTO 字段名保留 completedAt，承载 Settled At 语义（ADR 0006）。
    completedAt: (f.settledAt as string | null) ?? null,
    trashedAt: (f.trashedAt as string | null) ?? null,
    sortOrder: (f.sortOrder as number) ?? 0,
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
    sortOrder: (f.sortOrder as number) ?? 0,
    taskId: (f.taskId as string) ?? '',
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
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
    sortOrder: (f.sortOrder as number) ?? 0,
    status: (f.status as ProjectStatus) ?? ProjectStatus.ACTIVE,
    bucket: (f.bucket as ProjectBucket) ?? ProjectBucket.ANYTIME,
    scheduledType: (f.scheduledType as ScheduledType) ?? ScheduledType.NONE,
    scheduledDate: (f.scheduledDate as string | null) ?? null,
    dueDate: (f.dueDate as string | null) ?? null,
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
    sortOrder: (f.sortOrder as number) ?? 0,
    tags: tagIds.map((id) => tags.get(id)).filter((t): t is TagResponseDto => t !== undefined),
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

export function tagGroupRowToDto(
  row: ReplicaRow,
  memberTags: TagResponseDto[],
): TagGroupResponseDto {
  const f = row.fields;
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    sortOrder: (f.sortOrder as number) ?? 0,
    tags: memberTags,
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
    sortOrder: (f.sortOrder as number) ?? 0,
    status: (f.status as HeadingStatus) ?? HeadingStatus.ACTIVE,
    completedAt: (f.completedAt as string | null) ?? null,
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}
