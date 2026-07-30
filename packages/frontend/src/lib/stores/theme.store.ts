import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'taskora-theme';

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function applyThemeFromStorage() {
  const { mode } = useThemeStore.getState();
  applyTheme(mode);
}

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolved: resolveTheme('system'),
      setMode: (m) => {
        applyTheme(m);
        set({ mode: m, resolved: resolveTheme(m) });
      },
      cycle: () => {
        const order: ThemeMode[] = ['light', 'dark', 'system'];
        const current = order.indexOf(get().mode);
        get().setMode(order[(current + 1) % order.length]);
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.mode);
          state.resolved = resolveTheme(state.mode);
        }
      },
    },
  ),
);

// Module-level matchMedia listener (registered once on module load)
if (typeof window !== 'undefined') {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.mode === 'system') {
      applyTheme('system');
      useThemeStore.setState({ resolved: resolveTheme('system') });
    }
  });
}
