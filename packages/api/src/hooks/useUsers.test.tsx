import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updatePreferences } from '@/api/users.api';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useUpdatePreferences } from './useUsers';

vi.mock('@/api/users.api', () => ({ updatePreferences: vi.fn() }));

const initial = usePreferencesStore.getState();
afterEach(() => {
  usePreferencesStore.setState({
    timeZone: initial.timeZone,
    legacyDateTimeZone: initial.legacyDateTimeZone,
  });
  vi.clearAllMocks();
});

describe('保存账号时区后的查询一致性', () => {
  it('乐观设置值未变化，保存成功后仍重新失效时间视图，避免保留旧服务端结果', async () => {
    usePreferencesStore.setState({
      timeZone: 'Asia/Shanghai',
      legacyDateTimeZone: 'Asia/Shanghai',
    });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const keys = [
      ['tasks', 'list'],
      ['feed', 'today'],
      ['projects', 'list'],
    ];
    for (const key of keys) client.setQueryData(key, []);
    vi.mocked(updatePreferences).mockResolvedValue({
      id: 'u',
      preferences: { timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' },
    } as Awaited<ReturnType<typeof updatePreferences>>);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useUpdatePreferences(), { wrapper });
    act(() => result.current.mutate({ timeZone: 'Asia/Shanghai' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usePreferencesStore.getState().timeZone).toBe('Asia/Shanghai');
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    unmount();
    client.clear();
  });
});
