import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import SettingsGeneral from './SettingsGeneral';
import { MobileSettingsHarness } from '@/test/settingsNav';
import {
  createStatusBarController,
  registerStatusBarController,
  setClientKind,
  setNotificationShell,
  usePreferencesStore,
  type StatusBarController,
} from '@taskora/api';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

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

  it('saves the account time zone and rolls back a rejected update', async () => {
    usePreferencesStore.getState().setTimeZone('UTC');
    renderPage();
    const selector = screen.getByRole('combobox', { name: /Account time zone/i });
    await userEvent.selectOptions(selector, 'Asia/Shanghai');
    expect(usePreferencesStore.getState().timeZone).toBe('Asia/Shanghai');
    expect(mutationMocks.updatePreferences).toHaveBeenCalledWith(
      { timeZone: 'Asia/Shanghai' },
      expect.anything(),
    );
    act(() => capturedOnError()?.());
    expect(usePreferencesStore.getState().timeZone).toBe('UTC');
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

describe('SettingsGeneral — 登录时自动启动（桌面）', () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.mocked(toast.error).mockClear();
    setClientKind('desktop');
    vi.stubGlobal('__TAURI_INTERNALS__', {});
  });

  afterEach(() => {
    setClientKind('web');
    vi.unstubAllGlobals();
  });

  it('reads the current state from the shell command', async () => {
    invoke.mockResolvedValueOnce(true);
    renderPage();
    const toggle = screen.getByRole('switch', { name: /launch at login/i });
    await waitFor(() => expect(toggle).toBeChecked());
    expect(invoke).toHaveBeenCalledWith('launch_at_login_get', undefined);
  });

  it('persists the choice through the shell command', async () => {
    invoke.mockResolvedValueOnce(false).mockResolvedValueOnce(undefined);
    renderPage();
    const toggle = screen.getByRole('switch', { name: /launch at login/i });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(invoke).toHaveBeenLastCalledWith('launch_at_login_set', { enabled: true });
  });

  it('keeps the switch off and shows an error when enabling fails', async () => {
    invoke.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('denied'));
    renderPage();
    const toggle = screen.getByRole('switch', { name: /launch at login/i });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toggle).not.toBeChecked();
  });
});

describe('SettingsGeneral — Android status bar', () => {
  let controller: StatusBarController;
  const post = vi.fn(async () => {});

  beforeEach(() => {
    localStorage.clear();
    post.mockReset().mockResolvedValue(undefined);
    vi.mocked(toast.error).mockClear();
    setClientKind('mobile');
    controller = createStatusBarController({
      shell: {
        isPermissionGranted: async () => true,
        requestPermission: async () => true,
        post,
        clear: async () => {},
        onAction: () => {},
        openSettings: async () => {},
        notifyQuickAddFailed: async () => {},
      },
      t: (key) => key,
      listTodayTasks: async () => [],
      createDraft: async () => null,
    });
    controller.syncSession(true);
    registerStatusBarController(controller);
  });

  afterEach(() => {
    controller.destroy();
    registerStatusBarController(null);
    setClientKind('web');
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hides the desktop-only launch-at-login section on the Tauri mobile shell', () => {
    // 移动端也是 Tauri 运行时：__TAURI_INTERNALS__ 存在，但开关仍应隐藏。
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    renderPage();
    expect(screen.queryByText(/launch at login/i)).not.toBeInTheDocument();
  });

  it('shows a retryable error and keeps the switch off when native posting fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    post.mockRejectedValueOnce(new Error('native failure'));
    renderPage();
    const toggle = screen.getByRole('switch', { name: /status bar quick add/i });
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not show/i)),
    );
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('keeps the switch pending until native posting completes', async () => {
    let finish!: () => void;
    post.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderPage();
    const toggle = screen.getByRole('switch', { name: /status bar quick add/i });
    await userEvent.click(toggle);
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    await act(async () => {
      finish();
    });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
  });
});

describe('SettingsGeneral — reminder reliability (Android)', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  afterEach(() => setNotificationShell(null));

  it('renders the section only for a shell that reports delivery status', async () => {
    const base = {
      isSupported: () => true,
      isPermissionGranted: async () => true,
      requestPermission: async () => true,
      openSettings: async () => {},
    };
    setNotificationShell(base);
    const { unmount } = renderPage();
    expect(screen.queryByText('Reminder reliability')).not.toBeInTheDocument();
    unmount();

    setNotificationShell({
      ...base,
      reliability: async () => ({
        notifications: true,
        channelEnabled: true,
        exactAlarms: true,
        batteryUnrestricted: true,
      }),
      openSystemSettings: async () => {},
    });
    renderPage();
    expect(await screen.findByText('Reminder reliability')).toBeInTheDocument();
  });
});

describe('SettingsGeneral — 窄屏时区选项页', () => {
  beforeEach(() => {
    mutationMocks.updatePreferences.mockReset();
    usePreferencesStore.setState({ timeZone: 'Asia/Shanghai', bucketGrouping: true });
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('推入可搜索的时区列表，选中后返回并保存', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MobileSettingsHarness>
          <SettingsGeneral />
        </MobileSettingsHarness>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Asia\/Shanghai/ }));
    const search = screen.getByRole('searchbox');
    await user.type(search, 'tokyo');

    expect(screen.getByRole('radio', { name: 'Asia/Tokyo' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Asia/Shanghai' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Asia/Tokyo' }));

    expect(usePreferencesStore.getState().timeZone).toBe('Asia/Tokyo');
    expect(mutationMocks.updatePreferences).toHaveBeenCalledWith(
      { timeZone: 'Asia/Tokyo' },
      expect.anything(),
    );
    // 已返回通用页
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
