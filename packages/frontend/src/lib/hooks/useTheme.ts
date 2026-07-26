import { useThemeStore } from '@/lib/stores/theme.store';

export type { ThemeMode } from '@/lib/stores/theme.store';
export { applyTheme, applyThemeFromStorage } from '@/lib/stores/theme.store';

export function useTheme() {
  const { mode, resolved, setMode, cycle } = useThemeStore();
  return { mode, resolved, setMode, cycle };
}
