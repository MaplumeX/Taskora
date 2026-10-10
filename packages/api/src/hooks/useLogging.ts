import { useCallback } from 'react';

import { settledIsLogged } from '@taskora/engine';
import {
  loggedThroughAfterModeChange,
  type LoggingMode,
  type LoggingPreferences,
} from '@taskora/shared';

import { updatePreferences } from '@/api/users.api';
import { hydrateFromServer, usePreferencesStore } from '@/stores/preferences.store';
import { currentLegacyDateTimeZone, currentTimeZone } from '@/utils/date';
import { currentLogging } from '@/utils/logging';
import type { QueryCacheFacade } from '../engine/live-queries';
import { refreshAfterWrite, useQueryCache } from './cache-patches';
import { useCalendarDay } from './useCalendarDay';

/** 移入时机变了，视图按新规则重跑（REST 模式要等 hub 存下之后）。 */
const VIEW_ROOTS = ['tasks', 'feed', 'projects'];

/**
 * 乐观写入本地，再写回账号偏好；失败时退回写入前的值并 reject（由调用方
 * 提示）。两个字段一起写：LWW 下各端看到的是同一对值。
 */
async function persistLogging(next: LoggingPreferences, cache: QueryCacheFacade): Promise<void> {
  const store = usePreferencesStore.getState();
  const previous = currentLogging();
  store.setLogging(next);
  try {
    const user = await updatePreferences({
      loggingMode: next.mode,
      loggedThrough: next.loggedThrough,
    });
    hydrateFromServer(user.preferences);
    for (const root of VIEW_ROOTS) refreshAfterWrite(cache, { queryKey: [root] });
  } catch (error) {
    usePreferencesStore.getState().setLogging(previous);
    throw error;
  }
}

export interface LoggingActions {
  /** 切换移入时机；水位线按 loggedThroughAfterModeChange 推进。 */
  setLoggingMode: (mode: LoggingMode) => Promise<void>;
  /**
   * Log Completed：水位线推进到现在，所有 Unlogged Item 移入 Logbook。返回
   * 撤销函数（把水位线写回执行前的值）；立即模式下无操作，返回 null。
   */
  logCompleted: () => Promise<(() => Promise<void>) | null>;
}

export function useLoggingActions(): LoggingActions {
  const cache = useQueryCache();
  const setLoggingMode = useCallback(
    (mode: LoggingMode) => {
      const current = currentLogging();
      if (current.mode === mode) return Promise.resolve();
      const loggedThrough = loggedThroughAfterModeChange(
        current.mode,
        mode,
        current.loggedThrough,
        new Date(),
      );
      return persistLogging({ mode, loggedThrough }, cache);
    },
    [cache],
  );
  const logCompleted = useCallback(async () => {
    const before = currentLogging();
    if (before.mode === 'IMMEDIATE') return null;
    await persistLogging({ ...before, loggedThrough: new Date().toISOString() }, cache);
    return () =>
      persistLogging({ ...currentLogging(), loggedThrough: before.loggedThrough }, cache);
  }, [cache]);
  return { setLoggingMode, logCompleted };
}

/** 当前移入时机（订阅变化）。 */
export function useLoggingMode(): LoggingMode {
  return usePreferencesStore((s) => s.loggingMode);
}

/**
 * 已了结条目是否已移入 Logbook 的判定（completedAt 为了结时间）；跨天、
 * 换模式或推进水位线后返回新的函数引用。
 */
export function useIsLogged(): (item: { completedAt?: string | null }) => boolean {
  const day = useCalendarDay();
  const mode = usePreferencesStore((s) => s.loggingMode);
  const loggedThrough = usePreferencesStore((s) => s.loggedThrough);
  return useCallback(
    (item: { completedAt?: string | null }) =>
      settledIsLogged(item.completedAt, {
        timeZone: currentTimeZone(),
        legacyDateTimeZone: currentLegacyDateTimeZone(),
        now: new Date(),
        logging: { mode, loggedThrough },
      }),
    // day：跨天后每天模式的判定会变
    [day, mode, loggedThrough],
  );
}
