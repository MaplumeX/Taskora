import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_LOGGING_MODE,
  DEFAULT_REVIEW_INTERVALS,
  deviceTimeZone,
  isValidTimeZone,
  mergeTodaySeenKeys,
  type LoggingMode,
  type LoggingPreferences,
  type ReviewIntervalDefaults,
  type UserPreferences,
} from '@taskora/shared';

import { i18n } from '@/i18n/config';
import {
  isValidLanguage,
  laterDateKey,
  normalizePreferences,
  type Language,
  type ThemeMode,
  type WeekStartsOn,
} from '@/utils/preferences';

export type { Language, ThemeMode, WeekStartsOn };

const STORAGE_KEY = 'taskora-preferences';
const LEGACY_THEME_KEY = 'taskora-theme';
const LEGACY_WEEK_STARTS_KEY = 'taskora-week-starts';
const LEGACY_LANG_KEY = 'taskora-lang';

// 原生壳提供的系统主题优先于 WebView 的媒体查询；不属于用户偏好，不持久化。
let systemTheme: 'light' | 'dark' | null = null;

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (systemTheme) return systemTheme;
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

/** 更新原生系统主题；null 恢复浏览器媒体查询，手动主题不受影响。 */
export function setSystemTheme(theme: 'light' | 'dark' | null) {
  systemTheme = theme;
  syncSystemTheme();
}

function syncSystemTheme() {
  const state = usePreferencesStore.getState();
  if (state.theme !== 'system') return;
  applyTheme('system');
  const resolved = resolveTheme('system');
  if (state.resolved !== resolved) usePreferencesStore.setState({ resolved });
}

function initialLanguage(): Language {
  const lng = i18n.resolvedLanguage ?? i18n.language;
  return isValidLanguage(lng) ? lng : 'en';
}

interface PreferencesState {
  timeZone: string;
  legacyDateTimeZone: string;
  setTimeZone: (zone: string) => void;
  theme: ThemeMode;
  language: Language;
  weekStartsOn: WeekStartsOn;
  /** 时间视图按项目/区域分组（Grouped View）全局开关，默认开启。 */
  bucketGrouping: boolean;
  /** 最近一次确认 Today 新到的日期（New in Today 的基线，见 UserPreferences）。 */
  todayReviewedOn: string | null;
  /** New in Today 单条已读（见 UserPreferences.todaySeenKeys）。 */
  todaySeenKeys: string[];
  /** 默认回顾间隔（Default Review Interval）：新建 Project / Area 时写入的间隔。 */
  defaultReviewIntervals: ReviewIntervalDefaults;
  /** 移入时机（Logging Mode，ADR 0022）。 */
  loggingMode: LoggingMode;
  /** 移入水位线（见 UserPreferences.loggedThrough）。 */
  loggedThrough: string | null;
  resolved: 'light' | 'dark';
  setTheme: (m: ThemeMode) => void;
  setLanguage: (l: Language) => void;
  setWeekStartsOn: (v: WeekStartsOn) => void;
  setBucketGrouping: (v: boolean) => void;
  setDefaultReviewIntervals: (v: ReviewIntervalDefaults) => void;
  /** 原样写入移入时机与水位线（规则在 useLogging，这里不推导）。 */
  setLogging: (v: LoggingPreferences) => void;
  /** 记下已确认 Today 新到（只进不退，同时剔除被覆盖的单条已读）；返回是否推进了基线。 */
  markTodayReviewed: (dateKey: string) => boolean;
  /** 记下单条已读；返回是否有新增。 */
  markTodaySeen: (keys: readonly string[]) => boolean;
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
      timeZone: deviceTimeZone(),
      legacyDateTimeZone: deviceTimeZone(),
      setTimeZone: (zone) => {
        if (isValidTimeZone(zone)) set({ timeZone: zone });
      },
      theme: 'system',
      language: initialLanguage(),
      weekStartsOn: 1,
      bucketGrouping: true,
      todayReviewedOn: null,
      todaySeenKeys: [],
      defaultReviewIntervals: DEFAULT_REVIEW_INTERVALS,
      loggingMode: DEFAULT_LOGGING_MODE,
      loggedThrough: null,
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
      setBucketGrouping: (v) => set({ bucketGrouping: v }),
      setDefaultReviewIntervals: (v) => set({ defaultReviewIntervals: v }),
      setLogging: (v) => set({ loggingMode: v.mode, loggedThrough: v.loggedThrough }),
      markTodayReviewed: (dateKey) => {
        const current = get().todayReviewedOn;
        if (laterDateKey(current, dateKey) === current) return false;
        set({
          todayReviewedOn: dateKey,
          todaySeenKeys: mergeTodaySeenKeys(get().todaySeenKeys, [], dateKey),
        });
        return true;
      },
      markTodaySeen: (keys) => {
        const current = get().todaySeenKeys;
        const next = mergeTodaySeenKeys(current, keys, get().todayReviewedOn);
        if (next.length === current.length) return false;
        set({ todaySeenKeys: next });
        return true;
      },
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
        const {
          theme,
          language,
          weekStartsOn,
          bucketGrouping,
          timeZone,
          todayReviewedOn,
          todaySeenKeys,
          defaultReviewIntervals,
          loggingMode,
          loggedThrough,
        } = normalizePreferences(prefs, {
          timeZone: get().timeZone,
          theme: get().theme,
          language: get().language,
          weekStartsOn: get().weekStartsOn,
          bucketGrouping: get().bucketGrouping,
          todayReviewedOn: get().todayReviewedOn,
          todaySeenKeys: get().todaySeenKeys,
          defaultReviewIntervals: get().defaultReviewIntervals,
          loggingMode: get().loggingMode,
          loggedThrough: get().loggedThrough,
        });
        applyTheme(theme);
        applyLanguageSideEffect(language);
        const legacyZone = isValidTimeZone(prefs.legacyDateTimeZone)
          ? prefs.legacyDateTimeZone
          : isValidTimeZone(prefs.timeZone)
            ? prefs.timeZone
            : get().legacyDateTimeZone;
        set({
          theme,
          language,
          weekStartsOn,
          bucketGrouping,
          todayReviewedOn,
          todaySeenKeys,
          defaultReviewIntervals,
          loggingMode,
          loggedThrough,
          timeZone,
          legacyDateTimeZone: legacyZone,
          resolved: resolveTheme(theme),
        });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        timeZone: state.timeZone,
        legacyDateTimeZone: state.legacyDateTimeZone,
        theme: state.theme,
        language: state.language,
        weekStartsOn: state.weekStartsOn,
        bucketGrouping: state.bucketGrouping,
        todayReviewedOn: state.todayReviewedOn,
        todaySeenKeys: state.todaySeenKeys,
        defaultReviewIntervals: state.defaultReviewIntervals,
        loggingMode: state.loggingMode,
        loggedThrough: state.loggedThrough,
      }),
      merge: (persisted, current) => {
        // When the unified key is absent (first load after upgrade), fall back
        // to the legacy keys so existing users migrate transparently.
        const raw = persisted ?? readLegacyState();
        const {
          theme,
          language,
          weekStartsOn,
          bucketGrouping,
          timeZone,
          todayReviewedOn,
          todaySeenKeys,
          defaultReviewIntervals,
          loggingMode,
          loggedThrough,
        } = normalizePreferences(raw, {
          timeZone: current.timeZone,
          theme: current.theme,
          language: current.language,
          weekStartsOn: current.weekStartsOn,
          bucketGrouping: current.bucketGrouping,
          todayReviewedOn: current.todayReviewedOn,
          todaySeenKeys: current.todaySeenKeys,
          defaultReviewIntervals: current.defaultReviewIntervals,
          loggingMode: current.loggingMode,
          loggedThrough: current.loggedThrough,
        });
        return {
          ...current,
          timeZone,
          legacyDateTimeZone: isValidTimeZone((raw as Partial<PreferencesState>).legacyDateTimeZone)
            ? (raw as PreferencesState).legacyDateTimeZone
            : timeZone,
          theme,
          language,
          weekStartsOn,
          bucketGrouping,
          todayReviewedOn,
          todaySeenKeys,
          defaultReviewIntervals,
          loggingMode,
          loggedThrough,
          resolved: resolveTheme(theme),
        };
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
  mql.addEventListener('change', syncSystemTheme);
}

// Standalone hydrate function — calls the store's action without React context
export function hydrateFromServer(prefs: UserPreferences | null) {
  usePreferencesStore.getState().hydrateFromServer(prefs);
}
