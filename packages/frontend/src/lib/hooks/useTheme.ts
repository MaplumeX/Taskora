import { usePreferencesStore } from '@/lib/stores/preferences.store';

export type { ThemeMode } from '@/lib/utils/preferences';
export { applyTheme, applyThemeFromStorage } from '@/lib/stores/preferences.store';

export function useTheme() {
  const mode = usePreferencesStore((s) => s.theme);
  const resolved = usePreferencesStore((s) => s.resolved);
  const setMode = usePreferencesStore((s) => s.setTheme);
  const cycle = usePreferencesStore((s) => s.cycle);
  return { mode, resolved, setMode, cycle };
}
