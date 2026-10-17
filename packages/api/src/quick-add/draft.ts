/**
 * Quick Add 草稿落库（quick-add-android spec 第 4 节，桌面 quick-add-v2 共用）。
 *
 * 桌面浮窗与 Android 状态栏浮层都只产出 QuickAddDraft。转换与引用回落的
 * 规则在 shared 的 planQuickAddTask（hub 的 App 外送达同用）；这里按本地
 * 副本查引用，再按计划 create、补写 Reminder、追加 Subtask。
 */

import type {
  AreaResponseDto,
  CreateSubtaskDto,
  CreateTaskDto,
  ProjectResponseDto,
  QuickAddDraft,
  QuickAddPlacement,
  QuickAddReferences,
  SubtaskResponseDto,
  TagResponseDto,
  TaskResponseDto,
  UpdateTaskDto,
} from '@taskora/shared';
import { planQuickAddTask, toQuickAddDraft } from '@taskora/shared';
import { deriveSubtaskId } from '@taskora/engine';

import { getAreas } from '@/api/areas.api';
import { getProjects } from '@/api/projects.api';
import { getTags } from '@/api/tags.api';
import { currentTaskBackend } from '@/api/task-backend';

export { toQuickAddDraft };
export type { QuickAddDraft, QuickAddPlacement, QuickAddWhen } from '@taskora/shared';

export interface QuickAddResult {
  taskId: string;
  placedIn: QuickAddPlacement;
}

export interface QuickAddDeps {
  /** 只在给了预生成 id 时用来判断是否已落库；缺省视为不存在。 */
  getTask?(id: string): Promise<TaskResponseDto>;
  createTask(data: CreateTaskDto): Promise<TaskResponseDto>;
  updateTask(id: string, data: UpdateTaskDto): Promise<TaskResponseDto>;
  createSubtask(taskId: string, data: CreateSubtaskDto): Promise<SubtaskResponseDto>;
  getTags(): Promise<TagResponseDto[]>;
  getProjects(): Promise<ProjectResponseDto[]>;
  getAreas(): Promise<AreaResponseDto[]>;
}

const defaultDeps: QuickAddDeps = {
  getTask: (id) => currentTaskBackend().getTask(id),
  createTask: (data) => currentTaskBackend().createTask(data),
  updateTask: (id, data) => currentTaskBackend().updateTask(id, data),
  createSubtask: (taskId, data) => currentTaskBackend().createSubtask(taskId, data),
  getTags,
  getProjects,
  getAreas,
};

/**
 * 解析原生 / 中继送来的输入：JSON 对象按草稿解析；否则（旧版本只送标题、
 * 通知 RemoteInput、格式损坏）整串当标题。空输入返回 null。
 */
export function parseQuickAddInput(input: string | null | undefined): QuickAddDraft | null {
  if (!input?.trim()) return null;
  const text = input.trim();
  if (text.startsWith('{')) {
    try {
      const draft = toQuickAddDraft(JSON.parse(text));
      if (draft) return draft;
    } catch {
      // 不是合法 JSON：当作标题
    }
  }
  return { title: text };
}

/**
 * 输入是否要求落库后在应用中打开这条任务（Android 浮层的「在应用中继续」，
 * quick-add-android spec 第 6 节）。这是提交方式而非任务字段，不进草稿。
 */
export function quickAddOpensInApp(input: string | null | undefined): boolean {
  const text = input?.trim();
  if (!text?.startsWith('{')) return false;
  try {
    return (JSON.parse(text) as { openInApp?: unknown }).openInApp === true;
  } catch {
    return false;
  }
}

/**
 * Android 浮层提交的条目 id（android-out-of-app-writes）：原生入队时生成并
 * 写进 JSON，App 外送达时 hub 也用它建任务。与 openInApp 同为提交属性，不进草稿。
 */
export function quickAddEntryId(input: string | null | undefined): string | undefined {
  const text = input?.trim();
  if (!text?.startsWith('{')) return undefined;
  try {
    const id = (JSON.parse(text) as { id?: unknown }).id;
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
}

export interface QuickAddOptions {
  /**
   * 预生成的任务 id（Android 浮层条目 id）。给出时 Subtask id 按序号派生，
   * 与 hub 的 App 外送达产出同一组行；该任务已存在（hub 已建好并 pull 回来）
   * 即视为已落库，不再写入。
   */
  id?: string;
}

/** 草稿标题为空（trim 后）时返回 null，不落库。引用按本地副本校验（见 planQuickAddTask）。 */
export async function createFromQuickAddDraft(
  draft: QuickAddDraft,
  deps: QuickAddDeps = defaultDeps,
  options: QuickAddOptions = {},
): Promise<QuickAddResult | null> {
  if (!draft.title.trim()) return null;

  // 只查草稿用到的引用
  const refs: QuickAddReferences = {};
  if (draft.projectId) {
    refs.project = (await deps.getProjects()).find((p) => p.id === draft.projectId) ?? null;
  } else if (draft.areaId) {
    refs.area = (await deps.getAreas()).find((a) => a.id === draft.areaId) ?? null;
  }
  if (draft.tagIds?.length) {
    refs.knownTagIds = new Set((await deps.getTags()).map((tag) => tag.id));
  }
  const plan = planQuickAddTask(draft, refs);
  if (!plan) return null;

  const { id } = options;
  if (id && deps.getTask && (await deps.getTask(id).catch(() => null))) {
    return { taskId: id, placedIn: plan.placedIn };
  }

  const task = await deps.createTask(id ? { ...plan.dto, id } : plan.dto);
  // CreateTaskDto 不收 Reminder：建好后补写（同为本地写，进同一 Outbox）。
  if (plan.reminderTime) {
    await deps.updateTask(task.id, { reminderTime: plan.reminderTime });
  }
  // Subtask 逐条追加（缺省 afterId 即排在末尾），保持清单顺序。
  for (const [index, title] of plan.subtasks.entries()) {
    await deps.createSubtask(task.id, id ? { title, id: deriveSubtaskId(id, index) } : { title });
  }
  return { taskId: task.id, placedIn: plan.placedIn };
}
