/**
 * Project 的写入规则与 Trash 级联（形态约定见 tasks.ts 顶部）。
 */

import {
  ProjectStatus,
  ScheduledType,
  type CreateProjectDto,
  type ProjectBucket,
  type UpdateProjectDto,
} from '@taskora/shared';

import { resolveProjectBucket } from './bucket';
import { dateKeyOf, instantMs, type CalendarZones } from './calendar';
import { taskTrashPatch, type TaskPatch } from './tasks';

export interface ProjectFields {
  title: string;
  notes: string | null;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  dueDate: string | null;
  bucket: ProjectBucket;
  status: ProjectStatus;
  completedAt: string | null;
  trashedAt: string | null;
  areaId: string | null;
  tagIds: string[];
}

export type ProjectPatch = Partial<ProjectFields>;

export function planProjectCreate(input: CreateProjectDto, zones: CalendarZones): ProjectFields {
  const scheduledType = input.scheduledType ?? ScheduledType.NONE;
  return {
    title: input.title,
    notes: input.notes ?? null,
    scheduledType,
    scheduledDate:
      scheduledType === ScheduledType.DATE ? dateKeyOf(input.scheduledDate, zones) : null,
    dueDate: dateKeyOf(input.dueDate, zones),
    bucket: resolveProjectBucket(scheduledType),
    status: ProjectStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    areaId: input.areaId ?? null,
    tagIds: input.tagIds ?? [],
  };
}

export interface ProjectUpdateBase {
  scheduledType: unknown;
  scheduledDate: unknown;
  bucket: unknown;
}

/** 编辑项目：计划规则同任务（无提醒 / 重复）；Bucket 只由计划类型决定。 */
export function planProjectUpdate(
  existing: ProjectUpdateBase,
  input: UpdateProjectDto,
  zones: CalendarZones,
): ProjectPatch {
  const patch: ProjectPatch = {};
  const scheduledType = (input.scheduledType ?? existing.scheduledType) as ScheduledType;
  const schedulingChanged = input.scheduledType !== undefined || input.scheduledDate !== undefined;

  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (schedulingChanged) {
    patch.scheduledType = scheduledType;
    patch.scheduledDate =
      scheduledType !== ScheduledType.DATE
        ? null
        : input.scheduledDate !== undefined
          ? dateKeyOf(input.scheduledDate, zones)
          : dateKeyOf(existing.scheduledDate, zones);
  }
  if (input.dueDate !== undefined) patch.dueDate = dateKeyOf(input.dueDate, zones);
  const bucket = resolveProjectBucket(scheduledType);
  if (schedulingChanged || input.bucket !== undefined || bucket !== existing.bucket) {
    patch.bucket = bucket;
  }
  if (input.areaId !== undefined) patch.areaId = input.areaId;
  if (input.tagIds !== undefined) patch.tagIds = input.tagIds;
  return patch;
}

export function projectCompletePatch(now: string): ProjectPatch {
  return { status: ProjectStatus.COMPLETED, completedAt: now };
}

export function projectReopenPatch(): ProjectPatch {
  return { status: ProjectStatus.ACTIVE, completedAt: null };
}

export interface TrashableTask {
  id: string;
  trashedAt: unknown;
}

/**
 * 项目进 Trash：项目与其下仍在外面的任务拿到同一个时间戳（恢复时据此
 * 认出「随项目一起进去的」）。已经在 Trash 里的任务不动——改写它们的
 * 时间戳会让恢复项目时把它们也捡回来。
 */
export function planProjectTrash(
  now: string,
  tasks: readonly TrashableTask[],
): { project: ProjectPatch; tasks: Array<{ id: string; patch: TaskPatch }> } {
  return {
    project: { trashedAt: now },
    tasks: tasks
      .filter((task) => task.trashedAt == null)
      .map((task) => ({ id: task.id, patch: taskTrashPatch(now) })),
  };
}

/**
 * 项目恢复：只捡回与项目同一时刻进 Trash 的任务；项目进 Trash 前后
 * 单独删掉的任务保持原状。时间戳按时刻比较（两端存储形态不同）。
 */
export function planProjectRestore(
  projectTrashedAt: unknown,
  tasks: readonly TrashableTask[],
): { project: ProjectPatch; tasks: Array<{ id: string; patch: TaskPatch }> } {
  const cascadeMs = instantMs(projectTrashedAt);
  return {
    project: { trashedAt: null },
    tasks:
      cascadeMs === null
        ? []
        : tasks
            .filter((task) => instantMs(task.trashedAt) === cascadeMs)
            .map((task) => ({ id: task.id, patch: { trashedAt: null } })),
  };
}

/**
 * 清空 Trash：物理删除 Trash 里的任务与项目，以及 Trash 里项目下的
 * 全部任务（不论任务自身是否在 Trash）。Subtask / 分组随父实体级联。
 */
export function planEmptyTrash(
  projects: ReadonlyArray<{ id: string; trashedAt: unknown }>,
  tasks: ReadonlyArray<{ id: string; projectId: unknown; trashedAt: unknown }>,
): { taskIds: string[]; projectIds: string[] } {
  const projectIds = projects.filter((project) => project.trashedAt != null).map((p) => p.id);
  const trashedProjects = new Set(projectIds);
  const taskIds = tasks
    .filter(
      (task) =>
        task.trashedAt != null ||
        (typeof task.projectId === 'string' && trashedProjects.has(task.projectId)),
    )
    .map((task) => task.id);
  return { taskIds, projectIds };
}
