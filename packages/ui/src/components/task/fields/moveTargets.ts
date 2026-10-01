import type {
  AreaResponseDto,
  ProjectResponseDto,
  TaskResponseDto,
  UpdateTaskDto,
} from '@taskora/shared';
import { ScheduledType, TaskBucket } from '@taskora/shared';

import { flatParentOrder } from '@/components/feed/groupedFeedLayout';
import { isOpenProject } from '@/components/search/quickFindResults';
import { needleOf, rankByName } from '../../../lib/nameMatch';

/**
 * Move Picker 的目标推导（`.scratch/move-picker` spec 第 2 节）：纯函数。
 *
 * 只列「放在哪」：Inbox、Area、Project（未了结、未进 Trash，含 Later
 * Project）。无搜索词时 Inbox 在首位，其后与侧边栏同序、项目缩进在所属
 * 区域下；有搜索词时结果扁平，前缀命中先于包含命中，同档保持视觉顺序。
 */

export type MoveTarget =
  | { kind: 'inbox'; id: 'inbox' }
  | { kind: 'area'; id: string; area: AreaResponseDto }
  | {
      kind: 'project';
      id: string;
      project: ProjectResponseDto;
      /** 缩进在所属区域下（仅无搜索词时）。 */
      nested: boolean;
      /** 搜索结果扁平时在行尾标出的所属区域名。 */
      areaTitle: string | null;
      /** Later Project：弱化显示。 */
      later: boolean;
    };

export interface MoveTargetsInput {
  query: string;
  /** 侧边栏位次即数组顺序（与 Sidebar 同源）。 */
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
  /** Inbox 的名称：当前语言名称 + 英文名（别名）。 */
  inboxNames: string[];
  isLater: (project: ProjectResponseDto) => boolean;
}

export function buildMoveTargets(input: MoveTargetsInput): MoveTarget[] {
  const needle = needleOf(input.query);
  const areaById = new Map(input.areas.map((area) => [area.id, area]));
  const parents = flatParentOrder(input.projects.filter(isOpenProject), input.areas);

  const toTarget = (entry: (typeof parents)[number]): MoveTarget => {
    if (entry.kind === 'area')
      return { kind: 'area', id: `area:${entry.area.id}`, area: entry.area };
    const area = entry.project.areaId ? areaById.get(entry.project.areaId) : undefined;
    return {
      kind: 'project',
      id: `project:${entry.project.id}`,
      project: entry.project,
      nested: !needle && !!area,
      areaTitle: needle && area ? area.title : null,
      later: input.isLater(entry.project),
    };
  };

  if (!needle) return [{ kind: 'inbox', id: 'inbox' }, ...parents.map(toTarget)];

  const inbox: MoveTarget[] =
    rankByName([input.inboxNames], (names) => names, needle).length > 0
      ? [{ kind: 'inbox', id: 'inbox' }]
      : [];
  const places = rankByName(
    parents,
    (entry) => [entry.kind === 'area' ? entry.area.title : entry.project.title],
    needle,
  ).map(toTarget);
  return [...inbox, ...places];
}

/**
 * 目标 → 写入 DTO。区域与项目互斥；Area / Project 的 bucket 由数据层
 * 推导（获得归属即离开 Inbox），计划不变。移入 Inbox 同时清除计划
 * （CONTEXT：Inbox），提醒与重复规则随计划类型离开 DATE 一并清除。
 */
export function moveTargetDto(target: MoveTarget): UpdateTaskDto {
  switch (target.kind) {
    case 'inbox':
      return {
        projectId: null,
        areaId: null,
        bucket: TaskBucket.INBOX,
        scheduledType: ScheduledType.NONE,
      };
    case 'area':
      return { projectId: null, areaId: target.area.id };
    case 'project':
      return { projectId: target.project.id, areaId: null };
  }
}

export type MoveCurrent = Partial<
  Pick<TaskResponseDto, 'projectId' | 'areaId' | 'bucket' | 'scheduledType'>
>;

/** 任务当前所在的目标 id；不在任何目标里（如无归属的 Anytime / 已排期）或多选时为 null。 */
export function currentMoveTargetId(current: MoveCurrent): string | null {
  if (current.projectId) return `project:${current.projectId}`;
  if (current.areaId) return `area:${current.areaId}`;
  if (current.bucket === TaskBucket.INBOX && current.scheduledType === ScheduledType.NONE) {
    return 'inbox';
  }
  return null;
}
