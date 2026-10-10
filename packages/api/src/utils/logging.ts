import type { LoggingPreferences } from '@taskora/shared';

import { usePreferencesStore } from '@/stores/preferences.store';

/** 账号的移入时机（Logging Mode，ADR 0022）：视图判定与 Log Completed 用。 */
export function currentLogging(): LoggingPreferences {
  const { loggingMode, loggedThrough } = usePreferencesStore.getState();
  return { mode: loggingMode, loggedThrough };
}
