import type { ProjectResponseDto, UpdateProjectDto, UpdateTaskDto } from '@taskora/shared';
import { ProjectStatus, ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import { sortByEffectivePosition, toDateKey } from '@taskora/api';

import { currentMoveTargetId, moveTargetDto } from '@/components/task/fields/moveTargets';

/**
 * Sidebar Drop（CONTEXT.md）：把 Task（含多选整组）或 Project 行拖到侧边栏
 * 行上 = 对条目执行该行对应的既有动作。本模块是纯函数：落点 id 编解码与
 * 「拖什么 × 落哪」→ 逐项动作的规划；执行见 useSidebarDropExecutor。
 */

export type SidebarDropTarget =
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'anytime' }
  | { kind: 'someday' }
  | { kind: 'logbook' }
  | { kind: 'trash' }
  | { kind: 'area'; areaId: string }
  | { kind: 'project'; projectId: string };

export type SidebarDropTargetKind = SidebarDropTarget['kind'];

/** 被拖任务的当前字段（任务 DTO 与 feed 行都满足）。 */
export interface DropTask {
  id: string;
  projectId: string | null;
  areaId: string | null;
  bucket: string;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  status: string;
}

/** 被拖项目的当前字段（项目 DTO 与 feed 项目行都满足）。 */
export interface DropProject {
  id: string;
  areaId: string | null;
  status: string;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
}

/** 被拖的条目：一个任务或多选整组（按显示顺序），或一个项目。 */
export type SidebarDropPayload =
  | { kind: 'tasks'; tasks: DropTask[] }
  | { kind: 'project'; project: DropProject };

export type SidebarDropAction =
  | { type: 'updateTask'; id: string; data: UpdateTaskDto }
  | { type: 'completeTask'; id: string }
  | { type: 'deleteTask'; id: string }
  | { type: 'updateProject'; id: string; data: UpdateProjectDto }
  /** 归属改为该区域，并排到区域内项目末尾。 */
  | { type: 'moveProjectToArea'; id: string; areaId: string }
  /** 完成项目（有未了结任务时沿用剩余任务询问）。 */
  | { type: 'completeProject'; id: string }
  | { type: 'deleteProject'; id: string }
  /** 条目不动，在落点行上弹出计划日期卡片，由用户选定日期。 */
  | { type: 'pickTaskSchedule'; ids: string[] }
  | { type: 'pickProjectSchedule'; id: string };

const PREFIX = 'sidebar-drop:';

/** 侧边栏整体：指针在侧边栏内但不在任何可接收的行上时的 over。 */
export const SIDEBAR_DROP_REGION_ID = `${PREFIX}region`;

const SIMPLE_KINDS = new Set<SidebarDropTargetKind>([
  'inbox',
  'today',
  'upcoming',
  'anytime',
  'someday',
  'logbook',
  'trash',
]);

export function sidebarDropId(target: SidebarDropTarget): string {
  if (target.kind === 'area') return `${PREFIX}area:${target.areaId}`;
  if (target.kind === 'project') return `${PREFIX}project:${target.projectId}`;
  return `${PREFIX}${target.kind}`;
}

/** 侧边栏 droppable（含整体区域）的 id。 */
export function isSidebarDropId(id: string): boolean {
  return id.startsWith(PREFIX);
}

export function parseSidebarDropId(id: string): SidebarDropTarget | null {
  if (!isSidebarDropId(id)) return null;
  const rest = id.slice(PREFIX.length);
  if (rest.startsWith('area:')) return { kind: 'area', areaId: rest.slice('area:'.length) };
  if (rest.startsWith('project:')) {
    return { kind: 'project', projectId: rest.slice('project:'.length) };
  }
  return SIMPLE_KINDS.has(rest as SidebarDropTargetKind)
    ? ({ kind: rest } as SidebarDropTarget)
    : null;
}

/** 是否接收：只看拖的是什么、落在哪类行上，与各条目是否已在目标处无关。 */
export function sidebarDropAccepts(
  payloadKind: SidebarDropPayload['kind'],
  targetKind: SidebarDropTargetKind,
): boolean {
  if (payloadKind === 'tasks') return true;
  return targetKind !== 'inbox' && targetKind !== 'project';
}

function scheduledOn(item: Pick<DropTask, 'scheduledType' | 'scheduledDate'>, dateKey: string) {
  return (
    item.scheduledType === ScheduledType.DATE &&
    !!item.scheduledDate &&
    toDateKey(item.scheduledDate) === dateKey
  );
}

/** 计划为今天：同 When 卡片选「今天」（提醒 HH:mm 由数据层保留）。 */
function todayDto(today: string) {
  return { scheduledType: ScheduledType.DATE, scheduledDate: today };
}

const SOMEDAY_DTO = { scheduledType: ScheduledType.SOMEDAY };

/** 无计划（同计划卡片「清除」）；提醒与重复规则由数据层随之清除。 */
const NO_SCHEDULE_DTO = { scheduledType: ScheduledType.NONE, scheduledDate: null };

function planTask(task: DropTask, target: SidebarDropTarget, today: string): SidebarDropAction[] {
  const update = (data: UpdateTaskDto): SidebarDropAction[] => [
    { type: 'updateTask', id: task.id, data },
  ];
  const current = currentMoveTargetId({ ...task, bucket: task.bucket as TaskBucket });
  switch (target.kind) {
    case 'inbox':
      return current === 'inbox' ? [] : update(moveTargetDto({ kind: 'inbox', id: 'inbox' }));
    case 'area':
      return current === `area:${target.areaId}`
        ? []
        : update({ projectId: null, areaId: target.areaId });
    case 'project':
      return task.projectId === target.projectId
        ? []
        : update({ projectId: target.projectId, areaId: null });
    case 'today':
      return scheduledOn(task, today) ? [] : update(todayDto(today));
    case 'anytime':
      // 无计划、且已离开 Inbox（有归属，或无归属时选择了 Anytime）即已在 Anytime。
      return task.scheduledType === ScheduledType.NONE && task.bucket === TaskBucket.ANYTIME
        ? []
        : update({ ...NO_SCHEDULE_DTO, bucket: TaskBucket.ANYTIME });
    case 'someday':
      return task.scheduledType === ScheduledType.SOMEDAY ? [] : update(SOMEDAY_DTO);
    case 'upcoming':
      return [];
    case 'logbook':
      return task.status === TaskStatus.ACTIVE ? [{ type: 'completeTask', id: task.id }] : [];
    case 'trash':
      return [{ type: 'deleteTask', id: task.id }];
  }
}

function planProject(
  project: DropProject,
  target: SidebarDropTarget,
  today: string,
): SidebarDropAction[] {
  const id = project.id;
  switch (target.kind) {
    case 'area':
      return project.areaId === target.areaId
        ? []
        : [{ type: 'moveProjectToArea', id, areaId: target.areaId }];
    case 'today':
      return scheduledOn(project, today)
        ? []
        : [{ type: 'updateProject', id, data: todayDto(today) }];
    case 'upcoming':
      return [{ type: 'pickProjectSchedule', id }];
    case 'anytime':
      return project.scheduledType === ScheduledType.NONE
        ? []
        : [{ type: 'updateProject', id, data: NO_SCHEDULE_DTO }];
    case 'someday':
      return project.scheduledType === ScheduledType.SOMEDAY
        ? []
        : [{ type: 'updateProject', id, data: SOMEDAY_DTO }];
    case 'logbook':
      return project.status === ProjectStatus.COMPLETED ? [] : [{ type: 'completeProject', id }];
    case 'trash':
      return [{ type: 'deleteProject', id }];
    case 'inbox':
    case 'project':
      return [];
  }
}

/**
 * 落点规划：不接收返回 null；否则返回按条目顺序的动作（已在目标处的条目
 * 跳过，可能为空）。today 为账号时区今天的日期键（YYYY-MM-DD）。
 */
export function planSidebarDrop(
  payload: SidebarDropPayload,
  target: SidebarDropTarget,
  today: string,
): SidebarDropAction[] | null {
  if (!sidebarDropAccepts(payload.kind, target.kind)) return null;
  if (payload.kind === 'project') return planProject(payload.project, target, today);
  // 计划：整组共用一张计划日期卡片。
  if (target.kind === 'upcoming') {
    return [{ type: 'pickTaskSchedule', ids: payload.tasks.map((task) => task.id) }];
  }
  return payload.tasks.flatMap((task) => planTask(task, target, today));
}

/**
 * 项目改归属到区域后的全量项目顺序：排到该区域现有项目之后。区域内没有
 * 其它项目时顺序无关紧要，返回 null（不必重排）。
 */
export function projectOrderLastInArea(
  allProjects: ProjectResponseDto[],
  projectId: string,
  areaId: string,
): string[] | null {
  const ordered = sortByEffectivePosition(allProjects).filter(
    (project) => project.id !== projectId,
  );
  const ids = ordered.map((project) => project.id);
  const lastIndex = ordered.map((project) => project.areaId).lastIndexOf(areaId);
  if (lastIndex < 0) return null;
  return [...ids.slice(0, lastIndex + 1), projectId, ...ids.slice(lastIndex + 1)];
}

/**
 * 任务移入项目后的任务顺序：排在该项目无 Heading 部分现有任务之后（按落下
 * 的顺序）。只传这些行给 reorderTasks，只有被移入的任务会写新 Position。
 * 无 Heading 部分没有其它任务时返回 null（不必重排）。
 */
export function taskOrderLastInProject(
  projectTasks: Array<{ id: string; headingId: string | null; position?: string | null }>,
  movedIds: string[],
): string[] | null {
  const moved = new Set(movedIds);
  const others = sortByEffectivePosition(
    projectTasks.filter((task) => task.headingId === null && !moved.has(task.id)),
  ).map((task) => task.id);
  return others.length > 0 ? [...others, ...movedIds] : null;
}
