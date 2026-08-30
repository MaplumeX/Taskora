import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserPreferences } from '@taskora/shared';

import { i18n } from '@/i18n/config';
import {
  isValidLanguage,
  normalizePreferences,
  type Language,
  type ThemeMode,
  type WeekStartsOn,
} from '@/lib/utils/preferences';

export type { Language, ThemeMode, WeekStartsOn };

const STORAGE_KEY = 'taskora-preferences';
const LEGACY_THEME_KEY = 'taskora-theme';
const LEGACY_WEEK_STARTS_KEY = 'taskora-week-starts';
const LEGACY_LANG_KEY = 'taskora-lang';

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

/**
 * Apply theme synchronously before React renders (FOUC protection).
 * Relies on zustand persist rehydrating synchronously from localStorage
 * during module evaluation (same semantics as the old theme store).
 */
export function applyThemeFromStorage() {
  applyTheme(usePreferencesStore.getState().theme);
}

function initialLanguage(): Language {
  const lng = i18n.resolvedLanguage ?? i18n.language;
  return isValidLanguage(lng) ? lng : 'en';
}

interface PreferencesState {
  theme: ThemeMode;
  language: Language;
  weekStartsOn: WeekStartsOn;
  resolved: 'light' | 'dark';
  setTheme: (m: ThemeMode) => void;
  setLanguage: (l: Language) => void;
  setWeekStartsOn: (v: WeekStartsOn) => void;
  cycle: () => void;
  hydrateFromServer: (prefs: UserPreferences | null) => void;
}

/**
 * Read legacy localStorage keys (pre-unification storage) so existing users
 * migrate transparently on the first load after upgrade. Old keys are left
 * in place (rollback safety) — they are ignored once the unified key exists.
 */
function readLegacyState(): Record<string, unknown> {
  const legacy: Record<string, unknown> = {};
  try {
    const themeRaw = window.localStorage.getItem(LEGACY_THEME_KEY);
    if (themeRaw) {
      const parsed = JSON.parse(themeRaw) as { state?: { mode?: unknown } };
      legacy.theme = parsed?.state?.mode;
    }
  } catch {
    // corrupt legacy entry — ignore
  }
  try {
    const weekRaw = window.localStorage.getItem(LEGACY_WEEK_STARTS_KEY);
    if (weekRaw) {
      const parsed = JSON.parse(weekRaw) as { state?: { weekStartsOn?: unknown } };
      legacy.weekStartsOn = parsed?.state?.weekStartsOn;
    }
  } catch {
    // corrupt legacy entry — ignore
  }
  try {
    const langRaw = window.localStorage.getItem(LEGACY_LANG_KEY);
    // i18next detector stores the raw language string, not JSON.
    if (langRaw === 'zh' || langRaw === 'en') legacy.language = langRaw;
  } catch {
    // ignore
  }
  return legacy;
}

function applyLanguageSideEffect(language: Language) {
  // i18next initializes asynchronously; skip until the instance is ready
  // (the detector itself resolves localStorage/navigator language on init).
  if (!i18n.isInitialized) return;
  if (i18n.language !== language) {
    // The detector re-caches `taskora-lang`, keeping the legacy key in sync
    // during the migration period (rollback to an old build still works).
    void i18n.changeLanguage(language);
  }
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      language: initialLanguage(),
      weekStartsOn: 1,
      resolved: resolveTheme('system'),
      setTheme: (m) => {
        applyTheme(m);
        set({ theme: m, resolved: resolveTheme(m) });
      },
      setLanguage: (l) => {
        applyLanguageSideEffect(l);
        set({ language: l });
      },
      setWeekStartsOn: (v) => set({ weekStartsOn: v }),
      cycle: () => {
        const order: ThemeMode[] = ['light', 'dark', 'system'];
        const current = order.indexOf(get().theme);
        get().setTheme(order[(current + 1) % order.length]);
      },
      hydrateFromServer: (prefs) => {
        if (!prefs) return;
        // The server `User.preferences` column is schemaless Json — legacy or
        // dirty values (e.g. string "0", invalid theme) must be normalized
        // against the same whitelists used for localStorage rehydration.
        // Missing fields fall back to the current local values so partial
        // server payloads never clobber local preferences.
        const { theme, language, weekStartsOn } = normalizePreferences(prefs, {
          theme: get().theme,
          language: get().language,
          weekStartsOn: get().weekStartsOn,
        });
        applyTheme(theme);
        applyLanguageSideEffect(language);
        set({ theme, language, weekStartsOn, resolved: resolveTheme(theme) });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        weekStartsOn: state.weekStartsOn,
      }),
      merge: (persisted, current) => {
        // When the unified key is absent (first load after upgrade), fall back
        // to the legacy keys so existing users migrate transparently.
        const raw = persisted ?? readLegacyState();
        const { theme, language, weekStartsOn } = normalizePreferences(raw, {
          theme: current.theme,
          language: current.language,
          weekStartsOn: current.weekStartsOn,
        });
        return { ...current, theme, language, weekStartsOn, resolved: resolveTheme(theme) };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        applyTheme(state.theme);
        applyLanguageSideEffect(state.language);
      },
    },
  ),
);

// Module-level matchMedia listener (registered once on module load)
if (typeof window !== 'undefined') {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    const state = usePreferencesStore.getState();
    if (state.theme === 'system') {
      applyTheme('system');
      usePreferencesStore.setState({ resolved: resolveTheme('system') });
    }
  });
}

// Standalone hydrate function — calls the store's action without React context
export function hydrateFromServer(prefs: UserPreferences | null) {
  usePreferencesStore.getState().hydrateFromServer(prefs);
}
