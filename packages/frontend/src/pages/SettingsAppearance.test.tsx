import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsAppearance from './SettingsAppearance';
import { usePreferencesStore } from '@/lib/stores/preferences.store';

const mutationMocks = vi.hoisted(() => ({
  updatePreferences: vi.fn(),
}));

vi.mock('@/lib/hooks/useUsers', () => ({
  useUpdatePreferences: () => ({
    mutate: mutationMocks.updatePreferences,
  }),
}));

/** Extract the onError callback captured by the mocked mutate call. */
function capturedOnError(): (() => void) | undefined {
  const call = mutationMocks.updatePreferences.mock.calls.at(-1);
  const options = call?.[1] as { onError?: () => void } | undefined;
  return options?.onError;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsAppearance />
    </QueryClientProvider>,
  );
}

describe('SettingsAppearance rollback on save failure', () => {
  beforeEach(() => {
    mutationMocks.updatePreferences.mockReset();
    usePreferencesStore.setState({
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      resolved: 'light',
    });
  });

  it('optimistically sets weekStartsOn and reverts on mutate error', async () => {
    renderPage();
    const before = usePreferencesStore.getState().weekStartsOn;
    const sunday = screen.getByRole('button', { name: /sunday/i });
    await userEvent.click(sunday);

    expect(usePreferencesStore.getState().weekStartsOn).toBe(0); // optimistic
    expect(mutationMocks.updatePreferences).toHaveBeenCalledWith(
      { weekStartsOn: 0 },
      expect.anything(),
    );

    capturedOnError()?.();
    expect(usePreferencesStore.getState().weekStartsOn).toBe(before); // rolled back
  });

  it('optimistically sets theme and reverts on mutate error', async () => {
    renderPage();
    const dark = screen.getByRole('button', { name: /^dark$/i });
    await userEvent.click(dark);

    expect(usePreferencesStore.getState().theme).toBe('dark');
    expect(mutationMocks.updatePreferences).toHaveBeenCalledWith(
      { theme: 'dark' },
      expect.anything(),
    );

    capturedOnError()?.();
    expect(usePreferencesStore.getState().theme).toBe('system');
  });

  it('optimistically sets language and reverts on mutate error', async () => {
    renderPage();
    const zh = screen.getByRole('button', { name: '中文' });
    await userEvent.click(zh);

    expect(usePreferencesStore.getState().language).toBe('zh');
    expect(mutationMocks.updatePreferences).toHaveBeenCalledWith(
      { language: 'zh' },
      expect.anything(),
    );

    capturedOnError()?.();
    expect(usePreferencesStore.getState().language).toBe('en');
  });

  it('keeps the selection when mutate succeeds (no rollback)', async () => {
    renderPage();
    const sunday = screen.getByRole('button', { name: /sunday/i });
    await userEvent.click(sunday);

    expect(usePreferencesStore.getState().weekStartsOn).toBe(0);
  });
});
