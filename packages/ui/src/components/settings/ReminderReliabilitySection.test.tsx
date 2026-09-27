import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import ReminderReliabilitySection from './ReminderReliabilitySection';
import {
  setNotificationShell,
  useReminderPermissionStore,
  type ReminderNotificationShell,
  type ReminderReliabilityStatus,
} from '@taskora/api';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const allOk: ReminderReliabilityStatus = {
  notifications: true,
  channelEnabled: true,
  exactAlarms: true,
  batteryUnrestricted: true,
};

function makeShell(status: ReminderReliabilityStatus) {
  return {
    isSupported: () => true,
    isPermissionGranted: vi.fn(async () => status.notifications),
    requestPermission: vi.fn(async () => false),
    openSettings: vi.fn(async () => {}),
    reliability: vi.fn(async () => status),
    openSystemSettings: vi.fn(async () => {}),
  } satisfies ReminderNotificationShell;
}

describe('ReminderReliabilitySection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(toast.error).mockReset();
  });

  it('shows every check as OK and always offers the autostart entry', async () => {
    render(<ReminderReliabilitySection shell={makeShell(allOk)} />);

    await screen.findByText('Reminder reliability');
    for (const id of ['notifications', 'channel', 'exact-alarm', 'battery']) {
      expect(within(screen.getByTestId(`reliability-${id}`)).getByText('OK')).toBeInTheDocument();
    }
    expect(
      within(screen.getByTestId('reliability-autostart')).getByRole('button', { name: 'Open' }),
    ).toBeInTheDocument();
  });

  it('opens the matching system settings page and re-reads the status', async () => {
    const shell = makeShell({ ...allOk, exactAlarms: false, batteryUnrestricted: false });
    render(<ReminderReliabilitySection shell={shell} />);

    const exact = await screen.findByTestId('reliability-exact-alarm');
    await userEvent.click(within(exact).getByRole('button', { name: 'Fix' }));
    expect(shell.openSystemSettings).toHaveBeenCalledWith('exact-alarm');

    await userEvent.click(
      within(screen.getByTestId('reliability-battery')).getByRole('button', { name: 'Fix' }),
    );
    expect(shell.openSystemSettings).toHaveBeenCalledWith('battery');

    await userEvent.click(
      within(screen.getByTestId('reliability-autostart')).getByRole('button', { name: 'Open' }),
    );
    expect(shell.openSystemSettings).toHaveBeenCalledWith('autostart');
    await waitFor(() => expect(shell.reliability.mock.calls.length).toBeGreaterThanOrEqual(4));
  });

  it('asks for notification permission first, then falls back to the settings page', async () => {
    const shell = makeShell({ ...allOk, notifications: false });
    setNotificationShell(shell);
    render(<ReminderReliabilitySection shell={shell} />);

    const row = await screen.findByTestId('reliability-notifications');
    await userEvent.click(within(row).getByRole('button', { name: 'Fix' }));
    expect(shell.requestPermission).toHaveBeenCalled();
    await waitFor(() => expect(shell.openSettings).toHaveBeenCalled());
    expect(useReminderPermissionStore.getState().permission).toBe('denied');
    setNotificationShell(null);
  });

  it('routes a disabled reminder channel to the notification settings page', async () => {
    const shell = makeShell({ ...allOk, channelEnabled: false });
    render(<ReminderReliabilitySection shell={shell} />);

    const row = await screen.findByTestId('reliability-channel');
    await userEvent.click(within(row).getByRole('button', { name: 'Fix' }));
    expect(shell.openSettings).toHaveBeenCalled();
  });

  it('reports a settings page that cannot be opened', async () => {
    const shell = makeShell(allOk);
    shell.openSystemSettings.mockRejectedValue(new Error('no settings page'));
    render(<ReminderReliabilitySection shell={shell} />);

    const row = await screen.findByTestId('reliability-autostart');
    await userEvent.click(within(row).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('renders nothing when the status query fails', async () => {
    const shell = makeShell(allOk);
    shell.reliability.mockRejectedValue(new Error('ipc unavailable'));
    const { container } = render(<ReminderReliabilitySection shell={shell} />);
    await waitFor(() => expect(shell.reliability).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
