import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePreferencesStore } from '@/stores/preferences.store';
import { todayDateKey } from '@/utils/date';
import { currentStatusBarController } from '../status-bar/controller';

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
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      window.removeEventListener('focus', notify);
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
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.invalidateQueries({
      predicate: (query) => ['tasks', 'feed', 'projects'].includes(String(query.queryKey[0])),
    });
    currentStatusBarController()?.scheduleRefresh();
  }, [key, queryClient]);
}
