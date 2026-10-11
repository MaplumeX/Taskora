import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setUpdateShell, useUpdateStore, type UpdateShell } from '@taskora/api';

import SettingsAbout from './SettingsAbout';
import { MobileSettingsHarness } from '@/test/settingsNav';

const checkMocks = vi.hoisted(() => ({ checkForUpdates: vi.fn(async () => null) }));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  checkForUpdates: checkMocks.checkForUpdates,
}));

let shell: UpdateShell & { apply: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  shell = {
    action: 'restart',
    prepare: vi.fn(async () => true),
    apply: vi.fn(async () => undefined),
  };
  useUpdateStore.setState({
    autoCheck: true,
    skippedVersion: null,
    lastCheckedAt: null,
    verdict: null,
    readyVersion: null,
    checking: false,
    failed: false,
  });
});

afterEach(() => setUpdateShell(null));

describe('SettingsAbout 更新（ADR-0025）', () => {
  it('未注册平台壳（web）：不显示更新设置', () => {
    render(<SettingsAbout />);
    expect(screen.queryByRole('switch', { name: /check for updates/i })).toBeNull();
  });

  it('自动检查开关写入本机设置', async () => {
    setUpdateShell(shell);
    const user = userEvent.setup();
    render(<SettingsAbout />);

    await user.click(screen.getByRole('switch', { name: /automatically check for updates/i }));

    expect(useUpdateStore.getState().autoCheck).toBe(false);
  });

  it('立即检查：手动检查（清掉跳过的版本）', async () => {
    setUpdateShell(shell);
    const user = userEvent.setup();
    render(<SettingsAbout />);

    await user.click(screen.getByRole('button', { name: /check now/i }));

    expect(checkMocks.checkForUpdates).toHaveBeenCalledWith({ manual: true });
  });

  it('有已准备好的新版本：显示服务器版本，并可安装', async () => {
    setUpdateShell(shell);
    useUpdateStore.setState({
      verdict: { kind: 'update-available', hubVersion: '0.10.0' },
      readyVersion: '0.10.0',
    });
    const user = userEvent.setup();
    render(<SettingsAbout />);

    expect(screen.getByText('0.10.0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /update to v0\.10\.0/i }));

    expect(shell.apply).toHaveBeenCalledWith('0.10.0');
  });

  it('服务器过旧：提示升级服务器，不提供安装', () => {
    setUpdateShell(shell);
    useUpdateStore.setState({ verdict: { kind: 'hub-too-old', hubVersion: '0.8.0' } });
    render(<SettingsAbout />);

    expect(screen.getByText(/update the taskora server/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /update to/i })).toBeNull();
  });

  it('窄屏：同样提供开关与立即检查', async () => {
    setUpdateShell(shell);
    useUpdateStore.setState({ verdict: { kind: 'up-to-date', hubVersion: '0.9.0' } });
    render(
      <MobileSettingsHarness>
        <SettingsAbout />
      </MobileSettingsHarness>,
    );

    expect(screen.getByRole('switch', { name: /automatically check for updates/i })).toBeChecked();
    expect(screen.getByText(/up to date/i)).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: /check now/i }).click();
    });
    expect(checkMocks.checkForUpdates).toHaveBeenCalledWith({ manual: true });
  });
});
