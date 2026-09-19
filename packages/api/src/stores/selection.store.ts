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

export type SelectionRowKind = 'task' | 'heading' | 'project';

export interface SelectionRow {
  id: string;
  kind: SelectionRowKind;
  /** 行数据的完成态（仅 task 行有意义），用于批量完成时跳过已完成项。 */
  completed?: boolean;
  /** 行数据的取消态（仅 task 行有意义），用于批量取消时跳过已取消项。 */
  cancelled?: boolean;
}

interface SelectionState {
  /** 当前选中的行 id（有序；单个为键盘导航，多个为 ⌘A 批量选择）。 */
  selectedIds: string[];
  /** 各列表组件注册的可见行，key 为 scope 标识。 */
  scopes: Record<string, SelectionRow[]>;
  /** scope 注册顺序（DOM 渲染顺序），用于拼接完整行序列。 */
  scopeOrder: string[];
  setSelection: (ids: string[]) => void;
  registerScope: (key: string, rows: SelectionRow[]) => void;
  unregisterScope: (key: string) => void;
  /** 清空 selection（页面切换、点击空白时）。 */
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedIds: [],
  scopes: {},
  scopeOrder: [],
  setSelection: (ids) => set({ selectedIds: ids }),
  registerScope: (key, rows) =>
    set((state) => {
      const known = key in state.scopes;
      return {
        scopes: { ...state.scopes, [key]: rows },
        scopeOrder: known ? state.scopeOrder : [...state.scopeOrder, key],
      };
    }),
  unregisterScope: (key) =>
    set((state) => {
      if (!(key in state.scopes)) return state;
      const scopes = { ...state.scopes };
      delete scopes[key];
      return { scopes, scopeOrder: state.scopeOrder.filter((k) => k !== key) };
    }),
  clearSelection: () => set({ selectedIds: [] }),
}));

/** 按注册顺序拼接所有 scope 的行，得到当前页面的完整可遍历行序列。 */
export function flattenSelectionRows(state: SelectionState): SelectionRow[] {
  return state.scopeOrder.flatMap((key) => state.scopes[key] ?? []);
}
