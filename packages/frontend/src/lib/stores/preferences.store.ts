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
      // Normalize the persisted value: older/hand-written localStorage entries may
      // store "1"/"0" as strings or be missing entirely. A non-numeric weekStartsOn
      // poisons date math (Invalid Date) in the calendar and day-picker.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<PreferencesState>;
        const raw: unknown = stored.weekStartsOn;
        // Strict whitelist: only 0 or "0" mean Sunday start (Number(null) === 0
        // would otherwise mistype a null entry as Sunday).
        const weekStartsOn: WeekStartsOn = raw === 0 || raw === '0' ? 0 : 1;
        return { ...current, ...stored, weekStartsOn };
      },
    },
  ),
);

// Standalone hydrate function — calls the store's action without React context
export function hydrateFromServer(prefs: UserPreferences | null) {
  usePreferencesStore.getState().hydrateFromServer(prefs);
}