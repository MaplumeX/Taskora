import type {
  AreaResponseDto,
  FeedItem,
  ProjectFeedItem,
  ProjectResponseDto,
  TaskFeedItem,
} from '@taskora/shared';
import { ProjectStatus } from '@taskora/shared';
import { flatParentOrder as sharedFlatParentOrder } from '@taskora/api';

/**
 * Grouped View（分组视图）渲染块推导：纯函数、纯渲染层，不改数据模型
 * （镜像 sidebarProjectLayout.ts 的惯例：plain functions + vitest）。
 *
 * 输入：平铺 feed 项 + 项目列表 + 区域列表 + 分组开关。
 * 输出：渲染块序列（未分组任务与独立项目行在前，随后是按侧边栏
 * 全局视觉顺序排列的扁平单层 Area/Project 组）与视图任务全量顺序
 * （供 reorder 写回全局 Position）。分组不可折叠：无折叠状态输入，
 * 无 Selection 接管映射。
 */

export interface GroupedFeedTaskBlock {
  kind: 'task';
  item: TaskFeedItem;
  /** 所属 Group Header 的 id（项目/区域 id）；未分组任务为 null。 */
  groupHeaderId: string | null;
}

export interface GroupedFeedProjectRowBlock {
  kind: 'projectRow';
  item: ProjectFeedItem;
}

export interface GroupedFeedProjectGroupHeaderBlock {
  kind: 'projectGroupHeader';
  project: ProjectResponseDto;
  /** 视图内属于该组的任务 id（拖拽容器播种与 Alt+↑/↓ 组边界用）。 */
  taskIds: string[];
}

export interface GroupedFeedAreaGroupHeaderBlock {
  kind: 'areaGroupHeader';
  area: AreaResponseDto;
  /** 视图内属于该组的任务 id。 */
  taskIds: string[];
}

export type GroupedFeedBlock =
  | GroupedFeedTaskBlock
  | GroupedFeedProjectRowBlock
  | GroupedFeedProjectGroupHeaderBlock
  | GroupedFeedAreaGroupHeaderBlock;

export interface GroupedFeedLayout {
  blocks: GroupedFeedBlock[];
  /** 视图内全部任务 id 的分组后顺序，供 reorder 序列化。 */
  taskOrder: string[];
}

export interface GroupedFeedLayoutInput {
  items: FeedItem[];
  /** 侧边栏位次即数组顺序（与 Sidebar 同源）。 */
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
  groupingEnabled: boolean;
  /**
   * 即使视图内已无任务也保留组头的父级 id（拖拽中被拖任务的原组：把组里
   * 最后一个任务拖走时组头不消失，避免整列跳动）。
   */
  retainGroupIds?: ReadonlySet<string>;
}

/** feed 项的键（与 New in Today 新到键同形）。 */
export function feedItemKey(item: Pick<FeedItem, 'type' | 'id'>): string {
  return `${item.type}:${item.id}`;
}

/**
 * 项目能否成为 Group Header（组头）：已了结（Settled，Completed）或已入
 * Trash 的项目不得成组 —— 组是纯渲染层聚类，死父级不持有组头。
 */
function canHostGroup(project: ProjectResponseDto | undefined): project is ProjectResponseDto {
  return !!project && project.status !== ProjectStatus.COMPLETED && project.trashedAt === null;
}

/** 侧边栏全局视觉顺序的扁平父级序列（规则见 engine 的 flatParentOrder）。 */
export function flatParentOrder(
  projects: ProjectResponseDto[],
  areas: AreaResponseDto[],
): Array<
  { kind: 'project'; project: ProjectResponseDto } | { kind: 'area'; area: AreaResponseDto }
> {
  return sharedFlatParentOrder(projects, areas);
}

export function deriveGroupedFeedLayout(input: GroupedFeedLayoutInput): GroupedFeedLayout {
  const { items, projects, areas, groupingEnabled, retainGroupIds } = input;
  const retained = (parentId: string) => retainGroupIds?.has(parentId) ?? false;

  // 开关关闭：恒等推导 —— 平铺列表（收件箱、不分组的时间视图）的渲染序列。
  if (!groupingEnabled) {
    const blocks: GroupedFeedBlock[] = items.map((item) =>
      item.type === 'task'
        ? { kind: 'task', item, groupHeaderId: null }
        : { kind: 'projectRow', item },
    );
    return {
      blocks,
      taskOrder: items.filter((i) => i.type === 'task').map((i) => i.id),
    };
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const areaById = new Map(areas.map((a) => [a.id, a]));

  // 成员归属：直接父级优先 projectId，其次 areaId；父级缺失/已了结/已丢弃
  // 的任务视为孤儿，回落未分组（行上保留项目/区域标题标签）。
  const groupTasks = new Map<string, TaskFeedItem[]>(); // parentId -> 视图内任务（feed 顺序）
  const ungroupedTasks = new Set<string>();

  const pushGroupTask = (parentId: string, item: TaskFeedItem) => {
    const list = groupTasks.get(parentId);
    if (list) list.push(item);
    else groupTasks.set(parentId, [item]);
  };

  for (const item of items) {
    if (item.type !== 'task') continue;
    if (item.projectId) {
      // 归属以直接父级（项目）为准：项目可成组则进项目组（扁平单层，
      // 不嵌套进 Area 组）；项目已了结/已丢弃/缺失则为孤儿，一律回落
      // 未分组（行上保留项目标题标签），不因任务自身的 areaId 改挂
      // Area 组（spec Rule 5 / US25）。
      if (canHostGroup(projectById.get(item.projectId))) {
        pushGroupTask(item.projectId, item);
      } else {
        ungroupedTasks.add(item.id);
      }
    } else if (item.areaId && areaById.has(item.areaId)) {
      pushGroupTask(item.areaId, item);
    } else {
      ungroupedTasks.add(item.id);
    }
  }

  const blocks: GroupedFeedBlock[] = [];
  const taskOrder: string[] = [];

  /** 项目行是否被组头吸收（视图内有任务的可成组项目）。 */
  const absorbedByHeader = (item: ProjectFeedItem) =>
    canHostGroup(projectById.get(item.id)) &&
    ((groupTasks.get(item.id)?.length ?? 0) > 0 || retained(item.id));

  // ---- 顶部未分组区：未分组任务与独立项目行按合并 feed 顺序交错 ----
  for (const item of items) {
    if (item.type === 'task') {
      if (!ungroupedTasks.has(item.id)) continue;
      blocks.push({ kind: 'task', item, groupHeaderId: null });
      taskOrder.push(item.id);
      continue;
    }
    // 项目行：视图内有任务的项目被组头吸收；已了结/已丢弃项目永不成为组头。
    if (absorbedByHeader(item)) continue;
    blocks.push({ kind: 'projectRow', item });
  }

  // ---- 扁平单层组（侧边栏全局视觉顺序）：Area 组与 Project 组平级 ----
  for (const parent of flatParentOrder(projects, areas)) {
    if (parent.kind === 'project') {
      if (!canHostGroup(parent.project)) continue;
      const tasksInGroup = groupTasks.get(parent.project.id) ?? [];
      if (tasksInGroup.length === 0 && !retained(parent.project.id)) continue;
      blocks.push({
        kind: 'projectGroupHeader',
        project: parent.project,
        taskIds: tasksInGroup.map((t) => t.id),
      });
      for (const task of tasksInGroup) {
        taskOrder.push(task.id);
        blocks.push({ kind: 'task', item: task, groupHeaderId: parent.project.id });
      }
    } else {
      const tasksInGroup = groupTasks.get(parent.area.id) ?? [];
      if (tasksInGroup.length === 0 && !retained(parent.area.id)) continue;
      blocks.push({
        kind: 'areaGroupHeader',
        area: parent.area,
        taskIds: tasksInGroup.map((t) => t.id),
      });
      for (const task of tasksInGroup) {
        taskOrder.push(task.id);
        blocks.push({ kind: 'task', item: task, groupHeaderId: parent.area.id });
      }
    }
  }

  return { blocks, taskOrder };
}
