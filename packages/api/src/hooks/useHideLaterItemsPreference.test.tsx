import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const updatePreferences = vi.hoisted(() => vi.fn());
vi.mock('@/api/users.api', () => ({ updatePreferences }));

import { usePreferencesStore } from '@/stores/preferences.store';
import { useHideLaterItemsPreference } from './useHideLaterItemsPreference';

afterEach(() => {
  updatePreferences.mockReset();
  usePreferencesStore.setState({ hideLaterItemsInMovePicker: false });
});

describe('useHideLaterItemsPreference', () => {
  it('乐观切换并写回账号偏好', async () => {
    updatePreferences.mockResolvedValue({ preferences: { hideLaterItemsInMovePicker: true } });
    const { result } = renderHook(() => useHideLaterItemsPreference('hideLaterItemsInMovePicker'));
    act(() => result.current.toggle());
    expect(result.current.hidden).toBe(true);
    expect(updatePreferences).toHaveBeenCalledWith({ hideLaterItemsInMovePicker: true });
    await waitFor(() =>
      expect(usePreferencesStore.getState().hideLaterItemsInMovePicker).toBe(true),
    );
  });

  it('写回失败时回滚', async () => {
    updatePreferences.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useHideLaterItemsPreference('hideLaterItemsInMovePicker'));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.hidden).toBe(false));
  });
});
