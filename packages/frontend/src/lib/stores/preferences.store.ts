import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserPreferences } from '@taskora/shared';

import { useThemeStore } from './theme.store';
import { i18n } from '@/i18n/config';

type WeekStartsOn = 0 | 1;

interface PreferencesState {
  weekStartsOn: WeekStartsOn;
  setWeekStartsOn: (v: WeekStartsOn) => void;
  hydrateFromServer: (prefs: UserPreferences | null) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      weekStartsOn: 1,
      setWeekStartsOn: (v) => set({ weekStartsOn: v }),
      hydrateFromServer: (prefs) => {
        if (!prefs) return;
        useThemeStore.getState().setMode(prefs.theme);
        void i18n.changeLanguage(prefs.language);
        set({ weekStartsOn: prefs.weekStartsOn });
      },
    }),
    {
      name: 'taskora-week-starts',
      partialize: (state) => ({ weekStartsOn: state.weekStartsOn }),
    },
  ),
);

// Standalone hydrate function — calls the store's action without React context
export function hydrateFromServer(prefs: UserPreferences | null) {
  usePreferencesStore.getState().hydrateFromServer(prefs);
}