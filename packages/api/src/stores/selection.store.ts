import { create } from 'zustand';

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

export interface SelectionRow {
  id: string;
  kind: SelectionRowKind;
  /** 行数据的完成态（仅 task 行有意义），用于批量完成时跳过已完成项。 */
  completed?: boolean;
  /** 行数据的取消态（仅 task 行有意义），用于批量取消时跳过已取消项。 */
  cancelled?: boolean;
  /**
   * Grouped View：行所属的 Group Header id（组内任务行），或行自身即
   * 组头（组头行，与 id 相同）。未分组行（顶部浮动区）无此字段；
   * Alt+↑/↓ 以此在组边界处钳制，任务不会经键盘离开所在组。
   */
  groupHeaderId?: string;
  /** 仅 Group Header 行：新建上下文元数据。 */
  groupHeader?: SelectionRowGroupHeader;
}

interface SelectionState {
  /** 当前选中的行 id（有序；单个为键盘导航，多个为 ⌘A 批量选择）。 */
  selectedIds: string[];
  /** 各列表组件注册的可见行，key 为 scope 标识。 */
  scopes: Record<string, SelectionRow[]>;
  /** scope 注册顺序（DOM 渲染顺序），用于拼接完整行序列。 */
  scopeOrder: string[];
  /** scope 显式排序号（默认 0）：同页多个列表挂载时机不定时，按它确定先后，同号按注册顺序。 */
  scopeRank: Record<string, number>;
  setSelection: (ids: string[]) => void;
  registerScope: (key: string, rows: SelectionRow[], rank?: number) => void;
  unregisterScope: (key: string) => void;
  /** 清空 selection（页面切换、点击空白时）。 */
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedIds: [],
  scopes: {},
  scopeOrder: [],
  scopeRank: {},
  setSelection: (ids) => set({ selectedIds: ids }),
  registerScope: (key, rows, rank = 0) =>
    set((state) => {
      const known = key in state.scopes;
      return {
        scopes: { ...state.scopes, [key]: rows },
        scopeOrder: known ? state.scopeOrder : [...state.scopeOrder, key],
        scopeRank:
          state.scopeRank[key] === rank ? state.scopeRank : { ...state.scopeRank, [key]: rank },
      };
    }),
  unregisterScope: (key) =>
    set((state) => {
      if (!(key in state.scopes)) return state;
      const scopes = { ...state.scopes };
      delete scopes[key];
      const scopeRank = { ...state.scopeRank };
      delete scopeRank[key];
      return { scopes, scopeRank, scopeOrder: state.scopeOrder.filter((k) => k !== key) };
    }),
  clearSelection: () => set({ selectedIds: [] }),
}));

/** 按排序号（同号按注册顺序）拼接所有 scope 的行，得到当前页面的完整可遍历行序列。 */
export function flattenSelectionRows(state: SelectionState): SelectionRow[] {
  const rank = (key: string) => state.scopeRank?.[key] ?? 0;
  return [...state.scopeOrder]
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((key) => state.scopes[key] ?? []);
}
