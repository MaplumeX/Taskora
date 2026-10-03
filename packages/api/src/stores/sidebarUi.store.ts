import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 桌面侧边栏宽度（px）：默认值与可拖动范围。 */
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 400;
/**
 * 拖动折叠阈值（Things 式）：拖动中可以比最小宽度更窄；松手时窄于
 * 最小宽度的，停顿片刻后低于这个值收起，否则弹回最小宽度。
 */
export const SIDEBAR_COLLAPSE_THRESHOLD = 120;

/** 侧边栏宽度在 [MIN, MAX] 内取整。 */
export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/** 桌面侧边栏的宽度与折叠状态。仅存本机，不跨设备同步。 */
interface SidebarUiState {
  /** 展开时的宽度；折叠时保留，再展开回到这个宽度。 */
  width: number;
  collapsed: boolean;
  setWidth: (width: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
}

export const useSidebarUiStore = create<SidebarUiState>()(
  persist(
    (set) => ({
      width: SIDEBAR_DEFAULT_WIDTH,
      collapsed: false,
      setWidth: (width) => set({ width: clampSidebarWidth(width) }),
      setCollapsed: (collapsed) => set({ collapsed }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    { name: 'taskora-sidebar-ui' },
  ),
);
