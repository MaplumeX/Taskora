import { create } from 'zustand';

/**
 * 触控多选模式（Multi-Select Mode，对齐 Things 3 iPhone 的左滑进入选择）。
 *
 * 与键盘 Selection（selection.store，ADR-0004）是两套独立状态：触控
 * 交互没有 Selection，多选模式是显式进入 / 退出的模式——进入后点击行
 * = 切换勾选，底部工具栏对勾选集合批量执行动作。
 */
interface MultiSelectState {
  /** 是否处于多选模式（勾选集合可为空，模式仍保持）。 */
  active: boolean;
  /** 已勾选的 Task id（按勾选先后）。 */
  ids: string[];
  /** 以某个 Task 为首个勾选项进入多选模式；已在模式中则切换该项。 */
  enter: (id: string) => void;
  toggle: (id: string) => void;
  exit: () => void;
}

export const useMultiSelectStore = create<MultiSelectState>()((set) => ({
  active: false,
  ids: [],
  enter: (id) =>
    set((state) => {
      if (!state.active) return { active: true, ids: [id] };
      return { ids: toggleId(state.ids, id) };
    }),
  toggle: (id) => set((state) => ({ ids: toggleId(state.ids, id) })),
  exit: () => set({ active: false, ids: [] }),
}));

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
