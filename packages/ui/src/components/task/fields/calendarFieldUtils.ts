import { zhCN, enUS } from 'react-day-picker/locale';

import type { Locale } from 'react-day-picker';

const LOCALE_BY_LANG: Record<string, Locale> = {
  zh: zhCN,
  en: enUS,
};

export function getCalendarLocale(language: string): Locale {
  return LOCALE_BY_LANG[language] ?? enUS;
}

/** Normalize a picked date to local midnight to avoid off-by-one ISO shifts. */
export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
