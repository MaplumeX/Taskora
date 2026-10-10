import type { ReactNode } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduledType } from '@taskora/shared';
import { usePreferencesStore } from '@/stores/preferences.store';
import { usePageTaskContext } from './usePageTaskContext';

const initial = usePreferencesStore.getState();
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  usePreferencesStore.setState({
    timeZone: initial.timeZone,
    legacyDateTimeZone: initial.legacyDateTimeZone,
  });
});

function contextAt(pathname: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>
  );
  return renderHook(() => usePageTaskContext(), { wrapper }).result.current;
}

describe('页面新建上下文', () => {
  it.each(['/upcoming', '/tomorrow'])('%s 新建的任务计划为账号时区的明天', (pathname) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 上海已是 10-09，UTC 仍是 10-08：明天按账号时区算
    vi.setSystemTime(new Date('2026-10-08T17:00:00Z'));
    usePreferencesStore.setState({ timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' });

    expect(contextAt(pathname)).toEqual({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-10',
    });
  });
});
