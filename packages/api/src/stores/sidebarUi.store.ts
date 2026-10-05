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
  /**
   * 当前的收起是否由助手面板挤出来的（窗口放不下三栏）：空间够了自动展开。
   * 用户亲手展开 / 收起即接管，标记清除。
   */
  autoCollapsed: boolean;
  setWidth: (width: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  /** 为助手面板让位（true）或让位结束后展开（false）。 */
  setAutoCollapsed: (collapsed: boolean) => void;
}

export const useSidebarUiStore = create<SidebarUiState>()(
  persist(
    (set) => ({
      width: SIDEBAR_DEFAULT_WIDTH,
      collapsed: false,
      autoCollapsed: false,
      setWidth: (width) => set({ width: clampSidebarWidth(width) }),
      setCollapsed: (collapsed) => set({ collapsed, autoCollapsed: false }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed, autoCollapsed: false })),
      setAutoCollapsed: (collapsed) => set({ collapsed, autoCollapsed: collapsed }),
    }),
    { name: 'taskora-sidebar-ui' },
  ),
);
