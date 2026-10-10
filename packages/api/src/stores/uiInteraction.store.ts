import { create } from 'zustand';

export type SettingsTab =
  | 'general'
  | 'appearance'
  | 'shortcuts'
  | 'account'
  | 'data'
  | 'about'
  | 'assistant'
  | 'calendars';

interface UiInteractionState {
  expandedId: string | null;
  /**
   * 待滚入视野的行（Reveal Task：点通知定位任务）。行挂载并展开后自行
   * 滚动到视野中央并清除；与 expandedId 分离，普通点击展开不触发滚动。
   */
  revealId: string | null;
  pendingAutoEditId: string | null;
  /**
   * ⇧⌘C 的待处理请求：在该任务的展开态里新建一条子任务草稿。展开态可能
   * 尚未挂载（键位同时展开任务），因此保存为待处理状态，由展开态取走。
   */
  subtaskDraftTaskId: string | null;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  /**
   * 打开设置时显式指定的分类（如助手页「去配置」）；未指定为 null。
   * 窄屏设置据此决定停在分类首页还是直接推入该分类；桌面仍以 settingsTab
   * （默认外观）为准。
   */
  settingsEntryTab: SettingsTab | null;
  searchOpen: boolean;
  /** 打字唤起 Quick Find 时带入输入框的首字符；打开时取用一次。 */
  searchSeed: string | null;
  setSearchOpen: (open: boolean) => void;
  openSearch: (seed?: string) => void;
  takeSearchSeed: () => string | null;
  setExpandedId: (id: string | null) => void;
  setRevealId: (id: string | null) => void;
  setPendingAutoEditId: (id: string | null) => void;
  clearPendingAutoEditId: () => void;
  requestSubtaskDraft: (taskId: string) => void;
  /** 取走该任务的子任务草稿请求；有则返回 true。 */
  takeSubtaskDraft: (taskId: string) => boolean;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;
}

export const useUiInteractionStore = create<UiInteractionState>()((set, get) => ({
  expandedId: null,
  revealId: null,
  pendingAutoEditId: null,
  subtaskDraftTaskId: null,
  settingsOpen: false,
  settingsTab: 'appearance',
  settingsEntryTab: null,
  searchOpen: false,
  searchSeed: null,
  setSearchOpen: (open) =>
    set(open ? { searchOpen: true } : { searchOpen: false, searchSeed: null }),
  openSearch: (seed) => set({ searchOpen: true, searchSeed: seed || null }),
  takeSearchSeed: () => {
    const seed = get().searchSeed;
    if (seed !== null) set({ searchSeed: null });
    return seed;
  },
  setExpandedId: (id) => set({ expandedId: id }),
  setRevealId: (id) => set({ revealId: id }),
  setPendingAutoEditId: (id) => set({ pendingAutoEditId: id }),
  clearPendingAutoEditId: () => set({ pendingAutoEditId: null }),
  requestSubtaskDraft: (taskId) => set({ subtaskDraftTaskId: taskId }),
  takeSubtaskDraft: (taskId) => {
    if (get().subtaskDraftTaskId !== taskId) return false;
    set({ subtaskDraftTaskId: null });
    return true;
  },
  openSettings: (tab) =>
    set({ settingsOpen: true, settingsTab: tab ?? 'appearance', settingsEntryTab: tab ?? null }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
}));
