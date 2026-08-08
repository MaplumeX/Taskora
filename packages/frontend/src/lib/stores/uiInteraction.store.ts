import { create } from 'zustand';

export type SettingsTab = 'appearance' | 'account' | 'data' | 'about';

interface UiInteractionState {
  expandedId: string | null;
  pendingAutoEditId: string | null;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
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
  setExpandedId: (id) => set({ expandedId: id }),
  setPendingAutoEditId: (id) => set({ pendingAutoEditId: id }),
  clearPendingAutoEditId: () => set({ pendingAutoEditId: null }),
  openSettings: (tab = 'appearance') => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
}));