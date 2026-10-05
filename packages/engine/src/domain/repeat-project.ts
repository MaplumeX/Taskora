/**
 * 重复项目（recurring-projects spec）：完成带规则的项目时派生下一轮
 * 项目——项目连同 Headings、任务、Subtask 整份复制、全部重置为未完成，
 * 日期按项目计划日期的位移平移。设备与 REST 共用：同一输入得到同一组
 * 确定性 id 与字段，两端并发派生经 LWW 收敛（ADR-0012）。
 */

import {
  HeadingStatus,
  ProjectStatus,
  ScheduledType,
  TaskStatus,
  type RepeatRule,
} from '@taskora/shared';

import { deriveRepeatCopyId, deriveRepeatProjectId, nextOccurrenceDate } from '../repeat';
import { resolveProjectBucket, resolveTaskBucket } from './bucket';
import { dateKeyOf, daysBetweenKeys, shiftDateKey, type CalendarZones } from './calendar';
import { sortByEffectivePosition, type Positioned } from './order';
import type { ProjectFields, ProjectPatch } from './projects';
import { planRepeatSkip, type RepeatSkipBlock } from './repeat-instance';
import type { TaskFields, TaskPatch } from './tasks';

export interface RepeatProjectParent {
  id: string;
  title: string;
  notes: string | null;
  scheduledDate: unknown;
  dueDate: unknown;
  /** 规范化后的规则（两端各自从存储解析）。 */
  repeatRule: RepeatRule | null;
  areaId: string | null;
  tagIds: readonly string[];
}

export interface RepeatProjectHeading extends Positioned {
  title: string;
}

export interface RepeatProjectTask extends Positioned {
  title: string;
  notes: string | null;
  scheduledType: unknown;
  scheduledDate: unknown;
  dueDate: unknown;
  reminderTime: string | null;
  /** 规范化后的规则。 */
  repeatRule: RepeatRule | null;
  repeatSourceId: string | null;
  bucket: unknown;
  trashedAt: unknown;
  headingId: string | null;
  areaId: string | null;
  tagIds: readonly string[];
}

export interface RepeatProjectSubtask extends Positioned {
  title: string;
  taskId: string;
}

export interface RepeatHeadingFields {
  id: string;
  title: string;
  position: string | null;
  status: HeadingStatus;
  completedAt: null;
  projectId: string;
}

export interface RepeatProjectSubtaskFields {
  id: string;
  title: string;
  taskId: string;
  position: string | null;
  status: TaskStatus;
  settledAt: null;
}

export interface RepeatProjectCopy {
  headings: RepeatHeadingFields[];
  tasks: Array<TaskFields & { id: string; position: string | null }>;
  subtasks: RepeatProjectSubtaskFields[];
}

/** 下一个项目实例的确定性 id 与出现日（无规则 / 链已终结为 null）。 */
export function repeatProjectInstanceId(
  parent: Pick<RepeatProjectParent, 'id' | 'scheduledDate' | 'repeatRule'>,
  completedAt: string | null,
  zones: CalendarZones,
): { id: string; occurrence: string } | null {
  const rule = parent.repeatRule;
  if (!rule) return null;
  const occurrence = nextOccurrenceDate(rule, {
    scheduledDate: dateKeyOf(parent.scheduledDate, zones),
    settledAt: completedAt,
    timeZone: zones.timeZone,
    legacyDateTimeZone: zones.legacyDateTimeZone,
  });
  if (occurrence === null) return null; // 到达 until / 无锚：链终结
  return { id: deriveRepeatProjectId(parent.id, rule, occurrence), occurrence };
}

const shifted = (value: unknown, days: number, zones: CalendarZones): string | null => {
  const key = dateKeyOf(value, zones);
  return key === null ? null : shiftDateKey(key, days);
};

/**
 * 完成重复项目时派生的下一轮。parent 取完成前的状态；tasks / subtasks /
 * headings 为来源项目下的全部行（含 Trash 中的任务，这里自行过滤）。
 *
 * - 项目：标题 / 备注 / 标签 / 区域 / 规则复制，计划到出现日，截止日期
 *   平移 delta（出现日 − 来源计划日）。
 * - Headings：全部复制（含已归档），重置为 ACTIVE。
 * - 任务：未进 Trash 的全部复制（不论了结与否：这一轮做完或放弃不代表
 *   下一轮不做），排除项目内重复链的后代（repeatSourceId 指向同项目内
 *   任务——只复制链的源头，下一轮重新起链）。重置为 ACTIVE，日期平移，
 *   repeatSourceId 清空，分组映射到副本。
 * - Subtask：随任务复制，重置为未完成。
 *
 * 子实体 id 由 copyFor(实际项目 id) 按来源 id 派生：调用方先经
 * repeatDerivationTarget 决定跳过 / 用确定性 id / 换新 id。
 */
export function planRepeatProjectInstance(
  parent: RepeatProjectParent,
  completedAt: string,
  zones: CalendarZones,
): {
  id: string;
  project: ProjectFields;
  copyFor: (
    instanceId: string,
    children: {
      headings: ReadonlyArray<RepeatProjectHeading & { id: string }>;
      tasks: ReadonlyArray<RepeatProjectTask & { id: string }>;
      subtasks: ReadonlyArray<RepeatProjectSubtask & { id: string }>;
    },
  ) => RepeatProjectCopy;
} | null {
  const target = repeatProjectInstanceId(parent, completedAt, zones);
  if (!target) return null;
  const sourceKey = dateKeyOf(parent.scheduledDate, zones);
  const delta = sourceKey === null ? 0 : daysBetweenKeys(sourceKey, target.occurrence);

  return {
    id: target.id,
    project: {
      title: parent.title,
      notes: parent.notes,
      scheduledType: ScheduledType.DATE,
      scheduledDate: target.occurrence,
      dueDate: shifted(parent.dueDate, delta, zones),
      repeatRule: parent.repeatRule,
      repeatSourceId: parent.id,
      bucket: resolveProjectBucket(ScheduledType.DATE),
      status: ProjectStatus.ACTIVE,
      completedAt: null,
      trashedAt: null,
      areaId: parent.areaId,
      tagIds: [...parent.tagIds],
    },
    copyFor: (instanceId, children) => {
      const headings = sortByEffectivePosition(children.headings).map((heading) => ({
        id: deriveRepeatCopyId(instanceId, 'project-heading', heading.id),
        title: heading.title,
        position: heading.position ?? null,
        status: HeadingStatus.ACTIVE,
        completedAt: null,
        projectId: instanceId,
      }));
      const headingIds = new Map(
        children.headings.map((heading) => [
          heading.id,
          deriveRepeatCopyId(instanceId, 'project-heading', heading.id),
        ]),
      );

      const live = children.tasks.filter((task) => task.trashedAt == null);
      const inProject = new Set(children.tasks.map((task) => task.id));
      const templates = sortByEffectivePosition(
        live.filter((task) => !(task.repeatSourceId && inProject.has(task.repeatSourceId))),
      );
      const taskIds = new Map(
        templates.map((task) => [task.id, deriveRepeatCopyId(instanceId, 'task', task.id)]),
      );
      const tasks = templates.map((task) => {
        const scheduledType = (task.scheduledType as ScheduledType) ?? ScheduledType.NONE;
        const dated = scheduledType === ScheduledType.DATE;
        return {
          id: taskIds.get(task.id)!,
          position: task.position ?? null,
          title: task.title,
          notes: task.notes,
          scheduledType,
          scheduledDate: dated ? shifted(task.scheduledDate, delta, zones) : null,
          reminderTime: dated ? task.reminderTime : null,
          repeatRule: dated ? task.repeatRule : null,
          repeatSourceId: null,
          dueDate: shifted(task.dueDate, delta, zones),
          bucket: resolveTaskBucket(task.bucket, scheduledType, instanceId, task.areaId),
          status: TaskStatus.ACTIVE,
          settledAt: null,
          trashedAt: null,
          projectId: instanceId,
          headingId: task.headingId ? (headingIds.get(task.headingId) ?? null) : null,
          areaId: task.areaId,
          tagIds: [...task.tagIds],
        };
      });

      const subtasks = sortByEffectivePosition(
        children.subtasks.filter((subtask) => taskIds.has(subtask.taskId)),
      ).map((subtask) => ({
        id: deriveRepeatCopyId(instanceId, 'subtask', subtask.id),
        title: subtask.title,
        taskId: taskIds.get(subtask.taskId)!,
        position: subtask.position ?? null,
        status: TaskStatus.ACTIVE,
        settledAt: null,
      }));

      return { headings, tasks, subtasks };
    },
  };
}

// ---------- 跳过本次 ----------

export interface RepeatProjectSkipSource {
  status: unknown;
  trashedAt: unknown;
  scheduledType: unknown;
  scheduledDate: unknown;
  dueDate: unknown;
  /** 规范化后的规则。 */
  repeatRule: RepeatRule | null;
}

export interface RepeatProjectSkipTask {
  id: string;
  status: unknown;
  trashedAt: unknown;
  scheduledType: unknown;
  scheduledDate: unknown;
  dueDate: unknown;
}

/**
 * 项目跳过本次：项目计划日期按 planRepeatSkip 同一规则推进、截止日期
 * 平移；项目内未了结、未进 Trash 的任务，计划日期（DATE）与截止日期按
 * 同一天数平移。已了结的任务不动（不复活这一轮的记录）。不新建实体。
 * 项目没有取消态：未完成即 ACTIVE。
 */
export function planProjectRepeatSkip(
  project: RepeatProjectSkipSource,
  tasks: readonly RepeatProjectSkipTask[],
  hasLinkedInstance: boolean,
  now: string,
  zones: CalendarZones,
):
  | { project: ProjectPatch; tasks: Array<{ id: string; patch: TaskPatch }> }
  | { blocked: RepeatSkipBlock } {
  const plan = planRepeatSkip(
    {
      ...project,
      status: project.status === ProjectStatus.ACTIVE ? TaskStatus.ACTIVE : project.status,
    },
    hasLinkedInstance,
    now,
    zones,
  );
  if ('blocked' in plan) return plan;
  const from = dateKeyOf(project.scheduledDate, zones)!;
  const delta = daysBetweenKeys(from, plan.patch.scheduledDate!);
  const taskPatches = tasks
    .filter((task) => task.status === TaskStatus.ACTIVE && task.trashedAt == null)
    .flatMap((task) => {
      const patch: TaskPatch = {};
      if (task.scheduledType === ScheduledType.DATE) {
        const scheduledDate = shifted(task.scheduledDate, delta, zones);
        if (scheduledDate !== null) patch.scheduledDate = scheduledDate;
      }
      const dueDate = shifted(task.dueDate, delta, zones);
      if (dueDate !== null) patch.dueDate = dueDate;
      return Object.keys(patch).length > 0 ? [{ id: task.id, patch }] : [];
    });
  const projectPatch: ProjectPatch = { scheduledDate: plan.patch.scheduledDate };
  if (plan.patch.dueDate !== undefined) projectPatch.dueDate = plan.patch.dueDate;
  return { project: projectPatch, tasks: taskPatches };
}
