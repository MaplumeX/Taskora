import { create } from 'zustand';

/**
 * 侧边栏项目行的多选（对齐 Things 3 Mac）：⌘/Ctrl+点击切换单行，⇧+点击选中
 * 锚点到该行的连续范围；只含项目行，不含区域。多选不导航，主区域仍是当前
 * 列表；普通点击或路由变化即清空。与键盘 Selection、触控 Multi-Select Mode
 * 互不相通。只在本窗口内存里。
 */
interface SidebarSelectionState {
  /** 选中的项目 id（按选中先后）；空 = 没有多选，高亮跟随当前路由。 */
  ids: string[];
  /** 范围选择的固定端。 */
  anchorId: string | null;
  /** 侧边栏项目行的显示顺序（范围选择、整组顺序），由侧边栏登记。 */
  order: string[];
  setOrder: (order: string[]) => void;
  /** ⌘/Ctrl+点击：切换该行；首次多选时当前打开的项目一并选中。 */
  toggle: (id: string, currentId: string | null) => void;
  /** ⇧+点击：选中锚点（缺省为当前打开的项目）到该行的连续范围。 */
  extendTo: (id: string, currentId: string | null) => void;
  clear: () => void;
}

export const useSidebarSelectionStore = create<SidebarSelectionState>()((set, get) => ({
  ids: [],
  anchorId: null,
  order: [],
  setOrder: (order) => set({ order }),
  toggle: (id, currentId) => {
    const { ids } = get();
    const base = ids.length > 0 ? ids : currentId && currentId !== id ? [currentId] : [];
    set({
      ids: base.includes(id) ? base.filter((s) => s !== id) : [...base, id],
      anchorId: id,
    });
  },
  extendTo: (id, currentId) => {
    const { order, anchorId } = get();
    const anchor = anchorId ?? currentId ?? id;
    const from = order.indexOf(anchor);
    const to = order.indexOf(id);
    if (from < 0 || to < 0) {
      set({ ids: [id], anchorId: id });
      return;
    }
    const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    set({ ids: range, anchorId: anchor });
  },
  clear: () => {
    if (get().ids.length > 0 || get().anchorId !== null) set({ ids: [], anchorId: null });
  },
}));

/** 侧边栏多选的项目（≥ 2 个才算多选），按显示顺序；否则 null。 */
export function sidebarSelectionGroup(): string[] | null {
  const { ids, order } = useSidebarSelectionStore.getState();
  const selected = new Set(ids);
  const group = order.filter((id) => selected.has(id));
  return group.length > 1 ? group : null;
}

/**
 * 右键菜单的作用对象：右键的行在多选之中 → 整组（按显示顺序）；否则只作用于
 * 该行，且多选清空（菜单与高亮一致）。
 */
export function sidebarContextMenuTargets(id: string): string[] {
  const group = sidebarSelectionGroup();
  if (group?.includes(id)) return group;
  useSidebarSelectionStore.getState().clear();
  return [id];
}
