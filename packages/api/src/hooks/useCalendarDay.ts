import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usePreferencesStore } from '@/stores/preferences.store';
import type { LaterProjectFields, LaterProjectKind } from '@taskora/shared';
import { projectLaterKind, todayDateKey } from '@/utils/date';
import { currentStatusBarController } from '../status-bar/controller';
import { useQueryCache } from './cache-patches';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
const notify = () => {
  for (const listener of listeners) listener();
};
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(notify, 30_000);
    window.addEventListener('focus', notify);
    document.addEventListener('visibilitychange', notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      window.removeEventListener('focus', notify);
      document.removeEventListener('visibilitychange', notify);
    }
  };
}

/** One shared clock for all date consumers; snapshot changes only at midnight. */
export function useCalendarDay(): string {
  const zone = usePreferencesStore((state) => `${state.timeZone}:${state.legacyDateTimeZone}`);
  const day = useSyncExternalStore(subscribe, todayDateKey);
  return `${zone}:${day}`;
}

/** Mounted once by the shared app shell; does not remount editors. */
export function useCalendarQueryRefresh(): void {
  const key = useCalendarDay();
  const cache = useQueryCache();
  useEffect(() => {
    // 「今天」不是副本数据：Engine 模式下没有变更通知，同样要主动重跑
    for (const root of ['tasks', 'feed', 'projects', 'review']) {
      void cache.invalidateQueries({ queryKey: [root] });
    }
    currentStatusBarController()?.scheduleRefresh();
  }, [key, cache]);
}

/** 客户端 Later Project 判定（`projectLaterKind`），跨天 / 换时区后返回新的函数引用。 */
export function useLaterProjectKind(): (project: LaterProjectFields) => LaterProjectKind | null {
  const day = useCalendarDay();
  // 依赖 day：跨天 / 换时区时换新引用，让下游 useMemo 重新分组。
  return useCallback((project: LaterProjectFields) => projectLaterKind(project), [day]);
}
