import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsGeneral from './SettingsGeneral';
import { usePreferencesStore } from '@taskora/api';

const mutationMocks = vi.hoisted(() => ({
  updatePreferences: vi.fn(),
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
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
      <SettingsGeneral />
    </QueryClientProvider>,
  );
}

describe('SettingsGeneral — 时间视图分组开关', () => {
  beforeEach(() => {
    mutationMocks.updatePreferences.mockReset();
    usePreferencesStore.setState({
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
      resolved: 'light',
    });
    // jsdom 非 Tauri 运行时：桌面专属的「登录时自动启动」不出现。
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('renders the grouping toggle reflecting the current preference', () => {
    renderPage();
    const toggle = screen.getByRole('switch', {
      name: /group tasks by project\/area in time views/i,
    });
    expect(toggle).toBeChecked();
  });

  it('fires the preferences mutation with the new field and rolls back on error', async () => {
    renderPage();
    const toggle = screen.getByRole('switch', {
      name: /group tasks by project\/area in time views/i,
    });
    await userEvent.click(toggle);

    expect(usePreferencesStore.getState().bucketGrouping).toBe(false); // optimistic
    expect(mutationMocks.updatePreferences).toHaveBeenCalledWith(
      { bucketGrouping: false },
      expect.anything(),
    );

    capturedOnError()?.();
    expect(usePreferencesStore.getState().bucketGrouping).toBe(true); // rolled back
  });

  it('hides the desktop-only launch-at-login section off the desktop runtime', () => {
    renderPage();
    expect(screen.queryByText(/launch at login/i)).not.toBeInTheDocument();
  });
});
