import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 助手面板宽度（px）：默认值与可拖动范围的下限；上限由视口决定（见面板）。 */
export const ASSISTANT_PANEL_DEFAULT_WIDTH = 360;
export const ASSISTANT_PANEL_MIN_WIDTH = 320;

/**
 * Assistant 的跨视图 UI 状态（assistant-panel spec）：面板与全屏 `/agent`
 * 是同一组 Conversation 的两种视图，当前打开的 Conversation 由这里共享，
 * 切换模式时对话不断。仅存本机，不跨设备同步。
 */
interface AssistantUiState {
  /**
   * 用户最后选中的 Conversation；可能已被删除或尚未出现在列表里，
   * 实际展示的对话由 useActiveConversation 回落推导。
   */
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  /** 桌面端右侧助手面板是否打开（全屏 `/agent` 下不显示面板）。 */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  /** 用户拖动后的面板宽度（px）；渲染时再按当前视口钳制。 */
  panelWidth: number;
  setPanelWidth: (width: number) => void;
}

export const useAssistantUiStore = create<AssistantUiState>()(
  persist(
    (set) => ({
      activeConversationId: null,
      setActiveConversationId: (id) => set({ activeConversationId: id }),
      panelOpen: false,
      setPanelOpen: (open) => set({ panelOpen: open }),
      togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
      panelWidth: ASSISTANT_PANEL_DEFAULT_WIDTH,
      setPanelWidth: (width) =>
        set({ panelWidth: Math.max(ASSISTANT_PANEL_MIN_WIDTH, Math.round(width)) }),
    }),
    { name: 'taskora-assistant-ui' },
  ),
);
