import { create } from 'zustand';

/**
 * 撤销确认的请求（对齐 Things 3 iPhone：摇一摇弹出「撤销 …」确认）。平台壳
 * 检测到摇一摇时 request()；共享 UI 的 UndoPrompt 读取最近一步并确认撤销。
 */
interface UndoPromptState {
  open: boolean;
  request: () => void;
  close: () => void;
}

export const useUndoPromptStore = create<UndoPromptState>()((set) => ({
  open: false,
  request: () => set({ open: true }),
  close: () => set({ open: false }),
}));
