import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 用户自定义的快捷键（ADR-0017）：动作 id → 键位列表，只存改过的项；
 * 空数组表示用户解绑了该动作。键位注册表与默认值在 ui 包的 keymap.ts。
 * 键位带物理修饰键（mac ⌘ / Windows Ctrl），仅存本机，不跨设备同步。
 */
const KEYBINDINGS_STORAGE_KEY = 'taskora-keybindings';

interface KeybindingsState {
  overrides: Record<string, string[]>;
  setBinding: (id: string, chords: string[]) => void;
  /** 一次改多项（改绑时顺带从冲突动作上移除该键位）。 */
  setBindings: (changes: Record<string, string[]>) => void;
  resetBinding: (id: string) => void;
  resetAll: () => void;
}

export const useKeybindingsStore = create<KeybindingsState>()(
  persist(
    (set) => ({
      overrides: {},
      setBinding: (id, chords) => set((s) => ({ overrides: { ...s.overrides, [id]: chords } })),
      setBindings: (changes) => set((s) => ({ overrides: { ...s.overrides, ...changes } })),
      resetBinding: (id) =>
        set((s) => {
          const overrides = { ...s.overrides };
          delete overrides[id];
          return { overrides };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    { name: KEYBINDINGS_STORAGE_KEY },
  ),
);

// 桌面端 Quick Add 浮窗是常驻的独立 webview：主窗口改绑后经 storage 事件
// 重新读取，浮窗无需重启即用上新键位。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEYBINDINGS_STORAGE_KEY) void useKeybindingsStore.persist.rehydrate();
  });
}
