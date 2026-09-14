import { usePreferencesStore } from '@/stores/preferences.store';

export type { ThemeMode } from '@/utils/preferences';
export { applyTheme, applyThemeFromStorage } from '@/stores/preferences.store';

export function useTheme() {
  const mode = usePreferencesStore((s) => s.theme);
  const resolved = usePreferencesStore((s) => s.resolved);
  const setMode = usePreferencesStore((s) => s.setTheme);
  const cycle = usePreferencesStore((s) => s.cycle);
  return { mode, resolved, setMode, cycle };
}
