import { create } from 'zustand';

import type { RepeatRule, ScheduledType } from '@taskora/shared';

/**
 * Selection（键盘选中）跨页面全局状态（ADR-0004）。
 *
 * Selection 是键盘动作（完成、删除、于下方新建等）的作用对象，
 * 区别于 DOM focus 与完成态。列表组件通过 useSelectionScope 注册
 * 当前可见的行（有序），全局 keymap registry 读取注册表来移动
 * Selection 与派发动作。行内展开态（expandedId）仍由
 * uiInteraction store 承载（鼠标/键盘共用同一语义）。
 */

export type SelectionRowKind = 'task' | 'heading' | 'project' | 'area';

/** Grouped View 组头行的键盘元数据（ADR-0004 扩展）。 */
export interface SelectionRowGroupHeader {
  /** 「下方新建」落在该组头时预填的父级上下文（无 heading）。 */
  createContext: { projectId?: string; areaId?: string };
}

/**
 * 行数据的字段快照（task / project 行）：键盘的日期、移动、重复规则、在父列表
 * 中显示等动作据此计算写入值。任务 DTO、feed 行与项目 DTO 都满足。
 */
export interface SelectionRowItem {
  /** 标题：⌘C 复制时作为剪贴板文本。 */
  title?: string;
  status: string;
  bucket: string;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  dueDate: string | null;
  reminderTime?: string | null;
  repeatRule?: RepeatRule | null;
  projectId?: string | null;
  headingId?: string | null;
  areaId: string | null;
}

/** 键盘排序（⌘↑/⌘↓、⌥⌘↑/⌥⌘↓）的方向。 */
export type ReorderDirection = 'up' | 'down' | 'top' | 'bottom';

/** 列表随 scope 登记的能力：键盘动作经它写回，列表自行决定写哪种排序。 */
export interface SelectionScopeActions {
  /** 写回该 scope 的新行序（全部行 id，按新显示顺序）。 */
  reorder?: (orderedIds: string[]) => void;
  /** 选中任务归入新建的 Heading（项目页，⌥⇧⌘N）。 */
  headingFromSelection?: (taskIds: string[]) => void;
}

export interface SelectionRow {
  id: string;
  kind: SelectionRowKind;
  /** 行数据的完成态（仅 task 行有意义），用于批量完成时跳过已完成项。 */
  completed?: boolean;
  /** 行数据的取消态（仅 task 行有意义），用于批量取消时跳过已取消项。 */
  cancelled?: boolean;
  /** 行数据的自身 Tag（task / project 行），批量打标时各行在自己的原值上增减。 */
  tagIds?: string[];
  /**
   * Grouped View：行所属的 Group Header id（组内任务行），或行自身即
   * 组头（组头行，与 id 相同）。未分组行（顶部浮动区）无此字段；
   * Alt+↑/↓ 以此在组边界处钳制，任务不会经键盘离开所在组。
   */
  groupHeaderId?: string;
  /** 仅 Group Header 行：新建上下文元数据。 */
  groupHeader?: SelectionRowGroupHeader;
  /** 行数据快照（task / project 行）。 */
  item?: SelectionRowItem;
  /**
   * 可排序行的同级分组键：同一 scope 内同键的行之间可经键盘重排（项目页的
   * Heading、分组视图的组、Upcoming 的日期各成一组）。无此字段的行不可重排。
   */
  sortGroup?: string;
}

interface SelectionState {
  /**
   * 当前选中的行 id（有序；单个为键盘导航，多个为多选：⌘A、⌘/Ctrl+点击、
   * ⇧+点击、⇧↑/↓）。末项是光标（键盘移动、扩展选择的出发点）。多选只含任务行。
   */
  selectedIds: string[];
  /** 范围选择（⇧+点击、⇧↑/↓）的固定端；光标是 selectedIds 的末项。 */
  anchorId: string | null;
  /** 各列表组件注册的可见行，key 为 scope 标识。 */
  scopes: Record<string, SelectionRow[]>;
  /** scope 注册顺序（DOM 渲染顺序），用于拼接完整行序列。 */
  scopeOrder: string[];
  /** scope 显式排序号（默认 0）：同页多个列表挂载时机不定时，按它确定先后，同号按注册顺序。 */
  scopeRank: Record<string, number>;
  /** scope 登记的能力（排序写回等）。 */
  scopeActions: Record<string, SelectionScopeActions>;
  /** 替换选中；anchorId 缺省为首项（单选时即该行）。 */
  setSelection: (ids: string[], anchorId?: string | null) => void;
  registerScope: (
    key: string,
    rows: SelectionRow[],
    rank?: number,
    actions?: SelectionScopeActions,
  ) => void;
  unregisterScope: (key: string) => void;
  /** 清空 selection（页面切换、点击空白时）。 */
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedIds: [],
  anchorId: null,
  scopes: {},
  scopeOrder: [],
  scopeRank: {},
  scopeActions: {},
  setSelection: (ids, anchorId) =>
    set({ selectedIds: ids, anchorId: anchorId === undefined ? (ids[0] ?? null) : anchorId }),
  registerScope: (key, rows, rank = 0, actions) =>
    set((state) => {
      const known = key in state.scopes;
      return {
        scopes: { ...state.scopes, [key]: rows },
        scopeOrder: known ? state.scopeOrder : [...state.scopeOrder, key],
        scopeRank:
          state.scopeRank[key] === rank ? state.scopeRank : { ...state.scopeRank, [key]: rank },
        scopeActions:
          state.scopeActions[key] === actions
            ? state.scopeActions
            : { ...state.scopeActions, [key]: actions ?? {} },
      };
    }),
  unregisterScope: (key) =>
    set((state) => {
      if (!(key in state.scopes)) return state;
      const scopes = { ...state.scopes };
      delete scopes[key];
      const scopeRank = { ...state.scopeRank };
      delete scopeRank[key];
      const scopeActions = { ...state.scopeActions };
      delete scopeActions[key];
      return {
        scopes,
        scopeRank,
        scopeActions,
        scopeOrder: state.scopeOrder.filter((k) => k !== key),
      };
    }),
  clearSelection: () => set({ selectedIds: [], anchorId: null }),
}));

/** 按排序号（同号按注册顺序）拼接所有 scope 的行，得到当前页面的完整可遍历行序列。 */
export function flattenSelectionRows(state: SelectionState): SelectionRow[] {
  const rank = (key: string) => state.scopeRank?.[key] ?? 0;
  return [...state.scopeOrder]
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((key) => state.scopes[key] ?? []);
}

/** 当前页面的任务行 id 集合（多选只含任务行）。 */
function taskRowIds(rows: SelectionRow[]): Set<string> {
  return new Set(rows.filter((r) => r.kind === 'task').map((r) => r.id));
}

/**
 * ⌘/Ctrl+点击：把任务行加入或移出多选，并以它为新的锚点与光标。
 * 原选中里的非任务行（Heading、项目等）随之丢弃。
 */
export function toggleRowSelection(id: string): void {
  const state = useSelectionStore.getState();
  const tasks = taskRowIds(flattenSelectionRows(state));
  const kept = state.selectedIds.filter((s) => s !== id && tasks.has(s));
  if (state.selectedIds.includes(id)) {
    state.setSelection(kept, kept.at(-1) ?? null);
  } else {
    state.setSelection([...kept, id], id);
  }
}

/**
 * ⇧+点击 / ⇧↑↓：选中从锚点到 id 的连续任务行，锚点不变、id 成为光标
 * （排在末项）。没有锚点或锚点已不可见时退化为单选 id。
 */
export function extendSelectionTo(id: string): void {
  const state = useSelectionStore.getState();
  const rows = flattenSelectionRows(state);
  const anchor = state.anchorId ?? state.selectedIds.at(-1) ?? null;
  const from = anchor ? rows.findIndex((r) => r.id === anchor) : -1;
  const to = rows.findIndex((r) => r.id === id);
  if (from < 0 || to < 0) {
    state.setSelection([id]);
    return;
  }
  const step = to >= from ? 1 : -1;
  const ids: string[] = [];
  for (let i = from; i !== to + step; i += step) {
    if (rows[i].kind === 'task' && rows[i].id !== id) ids.push(rows[i].id);
  }
  state.setSelection([...ids, id], anchor);
}

/**
 * 右键菜单的作用对象：右键的行在多选（≥ 2 个任务行）之中 → 整组（按选中顺序）；
 * 否则只作用于该行，且若当前是多选，多选改为只选中该行（菜单与高亮一致）。
 */
export function contextMenuTargets(id: string): string[] {
  const state = useSelectionStore.getState();
  const tasks = taskRowIds(flattenSelectionRows(state));
  const selected = state.selectedIds.filter((s) => tasks.has(s));
  if (selected.length >= 2 && selected.includes(id)) return selected;
  if (state.selectedIds.length >= 2) state.setSelection([id]);
  return [id];
}

/** 含该行的 scope（行序与能力）；不在任何 scope 中返回 null。 */
export function scopeOfRow(
  id: string,
): { rows: SelectionRow[]; actions: SelectionScopeActions } | null {
  const state = useSelectionStore.getState();
  for (const key of state.scopeOrder) {
    const rows = state.scopes[key] ?? [];
    if (rows.some((row) => row.id === id)) return { rows, actions: state.scopeActions[key] ?? {} };
  }
  return null;
}

/**
 * 键盘排序（⌘↑/⌘↓ 一步、⌥⌘↑/⌥⌘↓ 到顶 / 到底）：把选中行作为一个整块，在
 * 同级（同 sortGroup）行之间移动；其他行（Heading、组头、别组的行）原位不动。
 * 选中行须同在一个 sortGroup 里；无法移动（已在边界、跨组、不可排序）时返回 null。
 */
export function reorderedRowIds(
  rows: readonly SelectionRow[],
  selectedIds: readonly string[],
  direction: ReorderDirection,
): string[] | null {
  const selected = new Set(selectedIds);
  const picked = rows.filter((row) => selected.has(row.id));
  if (picked.length === 0) return null;
  const group = picked[0].sortGroup;
  if (group === undefined || picked.some((row) => row.sortGroup !== group)) return null;

  const siblings = rows.filter((row) => row.sortGroup === group);
  const rest = siblings.filter((row) => !selected.has(row.id));
  const first = siblings.findIndex((row) => selected.has(row.id));
  const last =
    siblings.length - 1 - [...siblings].reverse().findIndex((row) => selected.has(row.id));
  // 选中块之前 / 之后（含块内间隙）的非选中同级行数
  const restBefore = siblings.slice(0, first).filter((row) => !selected.has(row.id)).length;
  const restThrough = siblings.slice(0, last).filter((row) => !selected.has(row.id)).length;
  let at: number;
  switch (direction) {
    case 'up':
      at = Math.max(0, restBefore - 1);
      break;
    case 'down':
      at = Math.min(rest.length, restThrough + 1);
      break;
    case 'top':
      at = 0;
      break;
    case 'bottom':
      at = rest.length;
      break;
  }
  const nextSiblings = [...rest.slice(0, at), ...picked, ...rest.slice(at)];
  if (nextSiblings.every((row, i) => row.id === siblings[i].id)) return null;

  // 同级行按新顺序填回原槽位
  let cursor = 0;
  return rows.map((row) => (row.sortGroup === group ? nextSiblings[cursor++].id : row.id));
}
