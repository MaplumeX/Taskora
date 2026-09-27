import { create } from 'zustand';

export type SettingsTab = 'general' | 'appearance' | 'account' | 'data' | 'about' | 'assistant';

interface UiInteractionState {
  expandedId: string | null;
  pendingAutoEditId: string | null;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  /**
   * 打开设置时显式指定的分类（如助手页「去配置」）；未指定为 null。
   * 窄屏设置据此决定停在分类首页还是直接推入该分类；桌面仍以 settingsTab
   * （默认外观）为准。
   */
  settingsEntryTab: SettingsTab | null;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  setExpandedId: (id: string | null) => void;
  setPendingAutoEditId: (id: string | null) => void;
  clearPendingAutoEditId: () => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;
}

export const useUiInteractionStore = create<UiInteractionState>()((set) => ({
  expandedId: null,
  pendingAutoEditId: null,
  settingsOpen: false,
  settingsTab: 'appearance',
  settingsEntryTab: null,
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  setExpandedId: (id) => set({ expandedId: id }),
  setPendingAutoEditId: (id) => set({ pendingAutoEditId: id }),
  clearPendingAutoEditId: () => set({ pendingAutoEditId: null }),
  openSettings: (tab) =>
    set({ settingsOpen: true, settingsTab: tab ?? 'appearance', settingsEntryTab: tab ?? null }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
}));
