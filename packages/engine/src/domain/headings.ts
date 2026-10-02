/**
 * Project Heading（分组）的写入规则（形态约定见 tasks.ts 顶部）。
 */

import { HeadingStatus, ProjectStatus, ScheduledType, TaskStatus } from '@taskora/shared';

import { resolveProjectBucket } from './bucket';
import { sortByEffectivePosition, type Positioned } from './order';
import type { ProjectFields } from './projects';
import { taskTrashPatch, type TaskPatch } from './tasks';

/** 分组列表顺序：有效 Position（与其他列表同一口径）。 */
export function sortHeadings<T extends Positioned>(headings: readonly T[]): T[] {
  return sortByEffectivePosition(headings);
}

interface HeadingTask {
  id: string;
  status: unknown;
  trashedAt: unknown;
}

/**
 * 删除分组：其下直接任务进 Trash（Subtask 随父任务），分组本身物理删除
 * （调用方）。已在 Trash 的任务不动。
 */
export function planHeadingDelete(
  now: string,
  tasks: readonly HeadingTask[],
): Array<{ id: string; patch: TaskPatch }> {
  return tasks
    .filter((task) => task.trashedAt == null)
    .map((task) => ({ id: task.id, patch: taskTrashPatch(now) }));
}

/**
 * 归档分组：其下未了结、不在 Trash 的任务标记完成（清除提醒），分组
 * 转为 COMPLETED。整组收尾不派生 Repeat Instance——新实例不应落进一个
 * 已归档的分组。
 */
export function planHeadingArchive(
  now: string,
  tasks: readonly HeadingTask[],
): {
  heading: { status: HeadingStatus; completedAt: string };
  tasks: Array<{ id: string; patch: TaskPatch }>;
} {
  return {
    heading: { status: HeadingStatus.COMPLETED, completedAt: now },
    tasks: tasks
      .filter((task) => task.status === TaskStatus.ACTIVE && task.trashedAt == null)
      .map((task) => ({
        id: task.id,
        patch: { status: TaskStatus.COMPLETED, settledAt: now, reminderTime: null },
      })),
  };
}

export function headingUnarchivePatch(): { status: HeadingStatus; completedAt: null } {
  return { status: HeadingStatus.ACTIVE, completedAt: null };
}

/**
 * 分组转项目：新项目用分组标题、继承源项目的区域，其余取新建默认值；
 * 分组下的全部任务（含 Trash 里的）移入新项目，只改归属，状态与其余
 * 字段不变。分组随后物理删除（调用方）。
 */
export function planHeadingToProject(
  headingTitle: string,
  sourceAreaId: string | null,
): { project: ProjectFields; taskPatch: (projectId: string) => TaskPatch } {
  return {
    project: {
      title: headingTitle,
      notes: null,
      scheduledType: ScheduledType.NONE,
      scheduledDate: null,
      dueDate: null,
      bucket: resolveProjectBucket(ScheduledType.NONE),
      status: ProjectStatus.ACTIVE,
      completedAt: null,
      trashedAt: null,
      areaId: sourceAreaId,
      tagIds: [],
    },
    taskPatch: (projectId) => ({ projectId, headingId: null }),
  };
}

/** 布局与当前数据不符（重复 / 缺失 / 不属于该项目）：客户端应刷新重试。 */
export class HeadingLayoutMismatchError extends Error {
  readonly name = 'HeadingLayoutMismatchError';
}

export interface HeadingLayout {
  ungroupedTaskIds: string[];
  groups: Array<{ headingId: string; taskIds: string[] }>;
}

function assertExactIdSet(submittedIds: string[], expectedIds: string[], kind: string): void {
  const submitted = new Set(submittedIds);
  const expected = new Set(expectedIds);
  if (submitted.size !== submittedIds.length) {
    throw new HeadingLayoutMismatchError(`Duplicate ${kind} id`);
  }
  if (submitted.size !== expected.size || [...submitted].some((id) => !expected.has(id))) {
    throw new HeadingLayoutMismatchError(`Invalid or omitted ${kind} id`);
  }
}

/** 布局参与者：项目下 ACTIVE 分组，与未了结、不在 Trash 的任务。 */
export function isLayoutTask(task: { status: unknown; trashedAt: unknown }): boolean {
  return task.status === TaskStatus.ACTIVE && task.trashedAt == null;
}

/**
 * 项目页布局重排：提交的分组与任务必须恰好是当前的参与者（否则抛
 * HeadingLayoutMismatchError）。返回目标状态：分组顺序、每个任务的
 * 分组归属，以及整页视觉顺序（未分组在前、各分组依次）——位次按它分配。
 */
export function planHeadingLayout(
  layout: HeadingLayout,
  activeHeadingIds: string[],
  layoutTaskIds: string[],
): {
  headingOrder: string[];
  taskHeading: Array<{ id: string; headingId: string | null }>;
  visualTaskIds: string[];
} {
  assertExactIdSet(
    layout.groups.map((group) => group.headingId),
    activeHeadingIds,
    'heading',
  );
  const visualTaskIds = [
    ...layout.ungroupedTaskIds,
    ...layout.groups.flatMap((group) => group.taskIds),
  ];
  assertExactIdSet(visualTaskIds, layoutTaskIds, 'task');
  return {
    headingOrder: layout.groups.map((group) => group.headingId),
    taskHeading: [
      ...layout.ungroupedTaskIds.map((id) => ({ id, headingId: null })),
      ...layout.groups.flatMap((group) =>
        group.taskIds.map((id) => ({ id, headingId: group.headingId })),
      ),
    ],
    visualTaskIds,
  };
}
