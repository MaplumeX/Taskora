import { create } from 'zustand';

interface UiInteractionState {
  expandedId: string | null;
  pendingAutoEditId: string | null;
  setExpandedId: (id: string | null) => void;
  setPendingAutoEditId: (id: string | null) => void;
  clearPendingAutoEditId: () => void;
}

export const useUiInteractionStore = create<UiInteractionState>()((set) => ({
  expandedId: null,
  pendingAutoEditId: null,
  setExpandedId: (id) => set({ expandedId: id }),
  setPendingAutoEditId: (id) => set({ pendingAutoEditId: id }),
  clearPendingAutoEditId: () => set({ pendingAutoEditId: null }),
}));
