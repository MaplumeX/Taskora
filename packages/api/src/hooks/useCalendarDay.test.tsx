import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useCalendarDay } from './useCalendarDay';

const initial = usePreferencesStore.getState();
afterEach(() => {
  vi.useRealTimers();
  usePreferencesStore.setState({
    timeZone: initial.timeZone,
    legacyDateTimeZone: initial.legacyDateTimeZone,
  });
});

describe('账号日历时钟', () => {
  it('时区变更立即更新，跨午夜或恢复前台时更新，卸载后清除唯一计时器', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T15:59:50Z'));
    usePreferencesStore.setState({
      timeZone: 'Asia/Shanghai',
      legacyDateTimeZone: 'Asia/Shanghai',
    });
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { result, unmount } = renderHook(() => useCalendarDay());
    expect(result.current).toContain('2026-09-23');
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current).toContain('2026-09-24');
    act(() => usePreferencesStore.getState().setTimeZone('America/Los_Angeles'));
    expect(result.current).toContain('2026-09-23');
    act(() => {
      vi.setSystemTime(new Date('2026-09-25T12:00Z'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toContain('2026-09-25');
    unmount();
    expect(intervals).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(intervals.mock.results[0].value);
    intervals.mockRestore();
    clear.mockRestore();
  });
});
