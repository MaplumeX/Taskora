import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Grouped View（分组视图）折叠状态：设备本地记忆（zustand + localStorage），
 * 镜像 projectUiPrefs.store.ts 的惯例。
 *
 * key 形状 `{view}:{parentId}`（parentId 为项目或领域 id），值为 collapsed；
 * 缺省（无记录）= 展开。折叠是纯 UI 状态：不进入 Change Event / 同步模型，
 * 不同设备、不同视图、不同父级互相独立。
 */
export function groupedViewCollapseKey(view: string, parentId: string): string {
  return `${view}:${parentId}`;
}

interface GroupedViewCollapseState {
  /** `{view}:{parentId}` -> true（仅记录已折叠项；展开不落地）。 */
  collapsed: Record<string, boolean>;
  setCollapsed: (view: string, parentId: string, collapsed: boolean) => void;
}

export const useGroupedViewCollapseStore = create<GroupedViewCollapseState>()(
  persist(
    (set) => ({
      collapsed: {},
      setCollapsed: (view, parentId, collapsed) =>
        set((state) => {
          const key = groupedViewCollapseKey(view, parentId);
          const next = { ...state.collapsed };
          if (collapsed) {
            next[key] = true;
          } else {
            // absence = expanded：重新展开即删除记录，控制 localStorage 体积。
            delete next[key];
          }
          return { collapsed: next };
        }),
    }),
    { name: 'taskora-grouped-view-collapse' },
  ),
);
