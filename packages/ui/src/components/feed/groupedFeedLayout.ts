import type {
  AreaResponseDto,
  FeedItem,
  ProjectFeedItem,
  ProjectResponseDto,
  TaskFeedItem,
} from '@taskora/shared';
import { ProjectStatus } from '@taskora/shared';

/**
 * Grouped View（分组视图）渲染块推导：纯函数、纯渲染层，不改数据模型
 * （镜像 sidebarProjectLayout.ts 的惯例：plain functions + vitest）。
 *
 * 输入：平铺 feed 项 + 项目列表 + 领域列表 + 本视图折叠状态 + 分组开关。
 * 输出：渲染块序列（未分组任务与独立项目行浮于顶部，随后是 Area 组，
 * 最后是独立项目组）、被折叠隐藏行的 Selection 接管映射、以及视图任务
 * 全量顺序（供 reorder 写回全局 Position）。
 */

export interface GroupedFeedTaskBlock {
  kind: 'task';
  item: TaskFeedItem;
  /** 所属 Group Header 的 id（项目/领域 id）；未分组任务为 null。 */
  groupHeaderId: string | null;
}

export interface GroupedFeedProjectRowBlock {
  kind: 'projectRow';
  item: ProjectFeedItem;
}

export interface GroupedFeedProjectGroupHeaderBlock {
  kind: 'projectGroupHeader';
  project: ProjectResponseDto;
  /** 视图内属于该组的任务 id（含折叠时隐藏的任务），供计数与 Selection 迁移。 */
  taskIds: string[];
  collapsed: boolean;
}

export interface GroupedFeedAreaGroupHeaderBlock {
  kind: 'areaGroupHeader';
  area: AreaResponseDto;
  /** 视图内直属该 Area 的任务数（组头计数徽章，不含子项目组的任务）。 */
  directTaskCount: number;
  /** 视图内直属该 Area 的任务 id（含折叠时隐藏的任务）。 */
  taskIds: string[];
  collapsed: boolean;
}

export type GroupedFeedBlock =
  | GroupedFeedTaskBlock
  | GroupedFeedProjectRowBlock
  | GroupedFeedProjectGroupHeaderBlock
  | GroupedFeedAreaGroupHeaderBlock;

export interface GroupedFeedLayout {
  blocks: GroupedFeedBlock[];
  /**
   * 被折叠隐藏的行 id → 应接管其 Selection 的可见组头 id。
   * 覆盖两类：隐藏的任务行，以及被 Area 折叠隐藏的子项目组头行。
   */
  selectionFallback: Record<string, string>;
  /** 视图内全部任务 id 的分组后顺序（与折叠无关），供 reorder 序列化。 */
  taskOrder: string[];
}

export interface GroupedFeedLayoutInput {
  items: FeedItem[];
  /** 侧边栏位次即数组顺序（与 Sidebar 同源）。 */
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
  /** 本视图的折叠映射：parentId（项目/领域 id） -> collapsed。 */
  collapsed: Record<string, boolean>;
  groupingEnabled: boolean;
}

/**
 * 项目能否成为 Group Header（组头）：已了结（Settled，Completed）或已入
 * Trash 的项目不得成组 —— 组是纯渲染层聚类，死父级不持有组头。
 */
function canHostGroup(project: ProjectResponseDto | undefined): project is ProjectResponseDto {
  return !!project && project.status !== ProjectStatus.COMPLETED && project.trashedAt === null;
}

export function deriveGroupedFeedLayout(input: GroupedFeedLayoutInput): GroupedFeedLayout {
  const { items, projects, areas, collapsed, groupingEnabled } = input;

  // 开关关闭：恒等推导 —— 与平铺 FeedListView 相同的渲染序列。
  if (!groupingEnabled) {
    const blocks: GroupedFeedBlock[] = items.map((item) =>
      item.type === 'task'
        ? { kind: 'task', item, groupHeaderId: null }
        : { kind: 'projectRow', item },
    );
    return {
      blocks,
      selectionFallback: {},
      taskOrder: items.filter((i) => i.type === 'task').map((i) => i.id),
    };
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const areaById = new Map(areas.map((a) => [a.id, a]));

  // 成员归属：直接父级优先 projectId，其次 areaId；父级缺失/已了结/已丢弃
  // 的任务视为孤儿，回落未分组（行上保留项目/领域标题标签）。
  const taskGroup = new Map<string, string>(); // taskId -> parentId（项目或领域 id）
  const groupTasks = new Map<string, TaskFeedItem[]>(); // parentId -> 视图内任务（feed 顺序）
  const ungroupedTasks = new Set<string>();

  const pushGroupTask = (parentId: string, item: TaskFeedItem) => {
    taskGroup.set(item.id, parentId);
    const list = groupTasks.get(parentId);
    if (list) list.push(item);
    else groupTasks.set(parentId, [item]);
  };

  for (const item of items) {
    if (item.type !== 'task') continue;
    if (item.projectId) {
      // 归属以直接父级（项目）为准：项目可成组则进项目组；项目已了结/
      // 已丢弃/缺失则为孤儿，一律回落未分组（行上保留项目标题标签），
      // 不因任务自身的 areaId 改挂 Area 组（spec Rule 5 / US27）。
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
  const selectionFallback: Record<string, string> = {};
  const taskOrder: string[] = [];

  // ---- 顶部未分组区：未分组任务与独立项目行按合并 feed 顺序交错 ----
  for (const item of items) {
    if (item.type === 'task') {
      if (!ungroupedTasks.has(item.id)) continue;
      blocks.push({ kind: 'task', item, groupHeaderId: null });
      taskOrder.push(item.id);
      continue;
    }
    // 项目行：视图内有任务的项目被组头吸收；已了结/已丢弃项目永不成为组头。
    const project = projectById.get(item.id);
    const hasVisibleTasks = (groupTasks.get(item.id)?.length ?? 0) > 0;
    if (canHostGroup(project) && hasVisibleTasks) continue;
    blocks.push({ kind: 'projectRow', item });
  }

  const emitProjectGroup = (project: ProjectResponseDto): boolean => {
    const tasksInGroup = groupTasks.get(project.id) ?? [];
    if (tasksInGroup.length === 0) return false;
    const isCollapsed = collapsed[project.id] === true;
    blocks.push({
      kind: 'projectGroupHeader',
      project,
      taskIds: tasksInGroup.map((t) => t.id),
      collapsed: isCollapsed,
    });
    for (const task of tasksInGroup) {
      taskOrder.push(task.id);
      if (isCollapsed) {
        selectionFallback[task.id] = project.id;
      } else {
        blocks.push({ kind: 'task', item: task, groupHeaderId: project.id });
      }
    }
    return true;
  };

  // ---- Area 组（侧边栏顺序）：直属任务在前，随后项目子组（侧边栏顺序） ----
  for (const areaEntity of areas) {
    const directTasks = groupTasks.get(areaEntity.id) ?? [];
    const subProjects = projects.filter(
      (p) => p.areaId === areaEntity.id && canHostGroup(p) && (groupTasks.get(p.id)?.length ?? 0) > 0,
    );
    if (directTasks.length === 0 && subProjects.length === 0) continue;

    const isCollapsed = collapsed[areaEntity.id] === true;
    blocks.push({
      kind: 'areaGroupHeader',
      area: areaEntity,
      directTaskCount: directTasks.length,
      taskIds: directTasks.map((t) => t.id),
      collapsed: isCollapsed,
    });

    if (isCollapsed) {
      // Area 折叠隐藏整个组体：直属任务、子项目组头及其任务都把
      // Selection 交给 Area 组头；任务顺序仍计入 taskOrder。
      for (const task of directTasks) {
        taskOrder.push(task.id);
        selectionFallback[task.id] = areaEntity.id;
      }
      for (const sub of subProjects) {
        selectionFallback[sub.id] = areaEntity.id;
        for (const task of groupTasks.get(sub.id) ?? []) {
          taskOrder.push(task.id);
          selectionFallback[task.id] = areaEntity.id;
        }
      }
      continue;
    }

    for (const task of directTasks) {
      taskOrder.push(task.id);
      blocks.push({ kind: 'task', item: task, groupHeaderId: areaEntity.id });
    }
    for (const sub of subProjects) {
      emitProjectGroup(sub);
    }
  }

  // ---- 独立项目组（无领域归属或领域缺失，侧边栏顺序） ----
  for (const projectEntity of projects) {
    if (projectEntity.areaId && areaById.has(projectEntity.areaId)) continue;
    if (!canHostGroup(projectEntity)) continue;
    emitProjectGroup(projectEntity);
  }

  return { blocks, selectionFallback, taskOrder };
}
