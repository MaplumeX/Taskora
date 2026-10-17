/**
 * Quick Add 草稿规则（quick-add-android spec 第 4 节；android-out-of-app-writes
 * issue 01 移入 shared）。
 *
 * 设备（`createFromQuickAddDraft`，按本地副本落库）与 hub（`POST /quick-add`，
 * Android 原生在 App 外直接送达）共用：不可信输入的规整、草稿到
 * CreateTaskDto 的转换与引用回落。读取 Project / Area / Tag 与写入留在各自一侧。
 * 草稿可能来自过期快照（浮层读的是上次推送的数据），所以引用的 Tag /
 * Project / Area 落库前要校验：Tag 丢弃，归属回落 Inbox。
 */

import type { CreateTaskDto } from './dtos/task.dto';
import { ProjectStatus } from './enums/project.enum';
import { Start } from './enums/task.enum';

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
  /** Subtask 标题，按清单顺序。 */
  subtasks?: string[];
}

/** 实际落入的位置（校验回落后），用于「已添加到 X」与跳转。 */
export type QuickAddPlacement =
  | { kind: 'inbox' }
  | { kind: 'project'; id: string; title: string }
  | { kind: 'area'; id: string; title: string };

/**
 * 草稿引用的现存实体，由调用方按草稿里的 id 查好（只查草稿用到的）：
 * 查不到的 Project / Area 传 null 或省略，Tag 只传仍存在的 id。
 */
export interface QuickAddReferences {
  project?: { id: string; title: string; status: ProjectStatus | string } | null;
  area?: { id: string; title: string } | null;
  knownTagIds?: ReadonlySet<string>;
}

/** 落库步骤：先 create，再补写 Reminder（CreateTaskDto 不收），再逐条追加 Subtask。 */
export interface QuickAddTaskPlan {
  dto: CreateTaskDto;
  reminderTime?: string;
  subtasks: string[];
  placedIn: QuickAddPlacement;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isString = (value: unknown): value is string => typeof value === 'string';
const nonEmpty = (value: unknown): string | undefined =>
  isString(value) && value.trim() ? value : undefined;

/**
 * 把不可信输入（原生 JSON、跨窗口事件载荷、hub 请求体）规整为草稿：非法字段
 * 丢弃（不整条拒绝），标题保留原样待 trim。不是对象或缺标题时返回 null。
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

  if (Array.isArray(raw.subtasks)) {
    const subtasks = raw.subtasks
      .filter(isString)
      .map((title) => title.trim())
      .filter(Boolean);
    if (subtasks.length) draft.subtasks = subtasks;
  }
  return draft;
}

/**
 * 草稿 → 落库计划。标题为空（trim 后）时返回 null，不落库。归属只认
 * ACTIVE 的 Project 或现存的 Area，否则回落 Inbox；Tag 只保留仍存在的。
 */
export function planQuickAddTask(
  draft: QuickAddDraft,
  refs: QuickAddReferences = {},
): QuickAddTaskPlan | null {
  const title = draft.title.trim();
  if (!title) return null;

  const dto: CreateTaskDto = { title };
  if (draft.notes?.trim()) dto.notes = draft.notes;
  if (draft.when?.type === 'date') {
    dto.scheduledDate = draft.when.date;
  } else if (draft.when?.type === 'someday') {
    dto.start = Start.SOMEDAY;
  }
  if (draft.dueDate) dto.dueDate = draft.dueDate;

  let placedIn: QuickAddPlacement = { kind: 'inbox' };
  const { project, area } = refs;
  if (draft.projectId) {
    if (project?.id === draft.projectId && project.status === ProjectStatus.ACTIVE) {
      dto.projectId = project.id;
      placedIn = { kind: 'project', id: project.id, title: project.title };
    }
  } else if (draft.areaId) {
    if (area?.id === draft.areaId) {
      dto.areaId = area.id;
      placedIn = { kind: 'area', id: area.id, title: area.title };
    }
  }

  if (draft.tagIds?.length && refs.knownTagIds) {
    const known = refs.knownTagIds;
    const tagIds = draft.tagIds.filter((id) => known.has(id));
    if (tagIds.length) dto.tagIds = tagIds;
  }

  const plan: QuickAddTaskPlan = {
    dto,
    subtasks: (draft.subtasks ?? []).map((s) => s.trim()).filter(Boolean),
    placedIn,
  };
  if (draft.reminderTime && dto.scheduledDate) plan.reminderTime = draft.reminderTime;
  return plan;
}
