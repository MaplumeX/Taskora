import { isValidTimeZone } from '@taskora/shared';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Language = 'zh' | 'en';
export type WeekStartsOn = 0 | 1;

export interface ValidPreferences {
  timeZone: string;
  theme: ThemeMode;
  language: Language;
  weekStartsOn: WeekStartsOn;
  bucketGrouping: boolean;
  todayReviewedOn: string | null;
}

export interface PreferencesDefaults {
  timeZone?: string;
  theme: ThemeMode;
  language: Language;
  weekStartsOn: WeekStartsOn;
  bucketGrouping: boolean;
  todayReviewedOn?: string | null;
}

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const LANGUAGES: readonly Language[] = ['zh', 'en'];

/**
 * Normalize an unknown preferences payload (server `User.preferences` Json
 * column, persisted localStorage state, or legacy keys) against strict
 * whitelists. Invalid or missing fields fall back to the provided defaults.
 *
 * Legacy tolerance: `weekStartsOn` may be the string `"0"`/`"1"` (older
 * hand-written localStorage / dirty Json column values) — accepted and
 * converted to numbers.
 */
export function normalizePreferences(
  raw: unknown,
  defaults: PreferencesDefaults,
): ValidPreferences {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const themeRaw = obj.theme;
  const theme: ThemeMode = THEME_MODES.includes(themeRaw as ThemeMode)
    ? (themeRaw as ThemeMode)
    : defaults.theme;

  const languageRaw = obj.language;
  const language: Language = LANGUAGES.includes(languageRaw as Language)
    ? (languageRaw as Language)
    : defaults.language;

  const weekRaw = obj.weekStartsOn;
  let weekStartsOn: WeekStartsOn;
  if (weekRaw === 0 || weekRaw === '0') {
    weekStartsOn = 0;
  } else if (weekRaw === 1 || weekRaw === '1') {
    weekStartsOn = 1;
  } else {
    weekStartsOn = defaults.weekStartsOn;
  }

  // 只接受真布尔值；缺失/脏值回落到调用方给的默认（本地现状或 true）。
  const groupingRaw = obj.bucketGrouping;
  const bucketGrouping = typeof groupingRaw === 'boolean' ? groupingRaw : defaults.bucketGrouping;

  const timeZone = isValidTimeZone(obj.timeZone) ? obj.timeZone : (defaults.timeZone ?? 'UTC');

  // 已看日期只进不退：取载荷与默认（本地现状）中较晚者，脏值忽略。
  const reviewedRaw = isDateKey(obj.todayReviewedOn) ? obj.todayReviewedOn : null;
  const todayReviewedOn = laterDateKey(reviewedRaw, defaults.todayReviewedOn ?? null);
  return { theme, language, weekStartsOn, bucketGrouping, timeZone, todayReviewedOn };
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 两个 YYYY-MM-DD 中较晚者（字典序即日期序）；缺失一方取另一方。 */
export function laterDateKey(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/** Whether a raw value is a valid theme mode. */
export function isValidThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode);
}

/** Whether a raw value is a valid language. */
export function isValidLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}
