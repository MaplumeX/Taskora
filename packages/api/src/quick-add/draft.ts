/**
 * Quick Add 草稿落库（quick-add-android spec 第 4 节，桌面 quick-add-v2 共用）。
 *
 * 桌面浮窗与 Android 状态栏浮层都只产出 QuickAddDraft，转换成
 * CreateTaskDto、补写 Reminder、校验引用都收敛在这里，两端规则只有一份。
 * 草稿可能来自过期快照（浮层读的是上次推送的数据），所以引用的 Tag /
 * Project / Area 落库前按本地副本校验：Tag 丢弃，归属回落 Inbox。
 */

import type {
  AreaResponseDto,
  CreateTaskDto,
  ProjectResponseDto,
  TagResponseDto,
  TaskResponseDto,
  UpdateTaskDto,
} from '@taskora/shared';
import { ProjectStatus, ScheduledType } from '@taskora/shared';

import { getAreas } from '@/api/areas.api';
import { getProjects } from '@/api/projects.api';
import { getTags } from '@/api/tags.api';
import { currentTaskBackend } from '@/api/task-backend';

export type QuickAddWhen = { type: 'date'; date: string } | { type: 'someday' };

export interface QuickAddDraft {
  title: string;
  notes?: string;
  /** 计划：日历日（YYYY-MM-DD）或 Someday；缺省为无计划。 */
  when?: QuickAddWhen;
  /** Reminder（HH:mm）：仅 when 为日期时有效。 */
  reminderTime?: string;
  /** 截止日期（YYYY-MM-DD）。 */
  dueDate?: string;
  projectId?: string;
  areaId?: string;
  tagIds?: string[];
}

/** 实际落入的位置（校验回落后），用于「已添加到 X」与跳转。 */
export type QuickAddPlacement =
  | { kind: 'inbox' }
  | { kind: 'project'; id: string; title: string }
  | { kind: 'area'; id: string; title: string };

export interface QuickAddResult {
  taskId: string;
  placedIn: QuickAddPlacement;
}

export interface QuickAddDeps {
  createTask(data: CreateTaskDto): Promise<TaskResponseDto>;
  updateTask(id: string, data: UpdateTaskDto): Promise<TaskResponseDto>;
  getTags(): Promise<TagResponseDto[]>;
  getProjects(): Promise<ProjectResponseDto[]>;
  getAreas(): Promise<AreaResponseDto[]>;
}

const defaultDeps: QuickAddDeps = {
  createTask: (data) => currentTaskBackend().createTask(data),
  updateTask: (id, data) => currentTaskBackend().updateTask(id, data),
  getTags,
  getProjects,
  getAreas,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isString = (value: unknown): value is string => typeof value === 'string';
const nonEmpty = (value: unknown): string | undefined =>
  isString(value) && value.trim() ? value : undefined;

/**
 * 把不可信输入（原生 JSON、跨窗口事件载荷）规整为草稿：非法字段丢弃（不
 * 整条拒绝），标题保留原样待 trim。不是对象或缺标题时返回 null。
 */
export function toQuickAddDraft(input: unknown): QuickAddDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (!isString(raw.title)) return null;
  const draft: QuickAddDraft = { title: raw.title };

  const notes = nonEmpty(raw.notes);
  if (notes) draft.notes = notes;

  const when = raw.when as Record<string, unknown> | undefined;
  if (when?.type === 'someday') {
    draft.when = { type: 'someday' };
  } else if (when?.type === 'date' && isString(when.date) && DATE_RE.test(when.date)) {
    draft.when = { type: 'date', date: when.date };
    if (isString(raw.reminderTime) && TIME_RE.test(raw.reminderTime)) {
      draft.reminderTime = raw.reminderTime;
    }
  }

  if (isString(raw.dueDate) && DATE_RE.test(raw.dueDate)) draft.dueDate = raw.dueDate;

  const projectId = nonEmpty(raw.projectId);
  const areaId = nonEmpty(raw.areaId);
  if (projectId) draft.projectId = projectId;
  else if (areaId) draft.areaId = areaId;

  if (Array.isArray(raw.tagIds)) {
    const tagIds = [...new Set(raw.tagIds.filter((id): id is string => !!nonEmpty(id)))];
    if (tagIds.length) draft.tagIds = tagIds;
  }
  return draft;
}

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

/** 草稿标题为空（trim 后）时返回 null，不落库。 */
export async function createFromQuickAddDraft(
  draft: QuickAddDraft,
  deps: QuickAddDeps = defaultDeps,
): Promise<QuickAddResult | null> {
  const title = draft.title.trim();
  if (!title) return null;

  const dto: CreateTaskDto = { title };
  if (draft.notes?.trim()) dto.notes = draft.notes;
  if (draft.when?.type === 'date') {
    dto.scheduledType = ScheduledType.DATE;
    dto.scheduledDate = draft.when.date;
  } else if (draft.when?.type === 'someday') {
    dto.scheduledType = ScheduledType.SOMEDAY;
  }
  if (draft.dueDate) dto.dueDate = draft.dueDate;

  let placedIn: QuickAddPlacement = { kind: 'inbox' };
  if (draft.projectId) {
    const project = (await deps.getProjects()).find(
      (p) => p.id === draft.projectId && p.status === ProjectStatus.ACTIVE,
    );
    if (project) {
      dto.projectId = project.id;
      placedIn = { kind: 'project', id: project.id, title: project.title };
    }
  } else if (draft.areaId) {
    const area = (await deps.getAreas()).find((a) => a.id === draft.areaId);
    if (area) {
      dto.areaId = area.id;
      placedIn = { kind: 'area', id: area.id, title: area.title };
    }
  }

  if (draft.tagIds?.length) {
    const known = new Set((await deps.getTags()).map((tag) => tag.id));
    const tagIds = draft.tagIds.filter((id) => known.has(id));
    if (tagIds.length) dto.tagIds = tagIds;
  }

  const task = await deps.createTask(dto);
  // CreateTaskDto 不收 Reminder：建好后补写（同为本地写，进同一 Outbox）。
  if (draft.reminderTime && dto.scheduledType === ScheduledType.DATE) {
    await deps.updateTask(task.id, { reminderTime: draft.reminderTime });
  }
  return { taskId: task.id, placedIn };
}
