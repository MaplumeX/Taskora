import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setUpdateShell, useUpdateStore, type UpdateShell } from '@taskora/api';

import { UpdatePrompt } from './UpdatePrompt';

let shell: UpdateShell & { apply: ReturnType<typeof vi.fn> };

function ready(kind: 'update-available' | 'client-too-old', version = '0.10.0') {
  useUpdateStore.setState({ verdict: { kind, hubVersion: version }, readyVersion: version });
}

beforeEach(() => {
  shell = {
    action: 'restart',
    prepare: vi.fn(async () => true),
    apply: vi.fn(async () => undefined),
  };
  setUpdateShell(shell);
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

describe('UpdatePrompt（ADR-0026）', () => {
  it('没有已准备好的更新：不渲染', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('未注册平台壳（web）：不渲染', () => {
    setUpdateShell(null);
    ready('update-available');
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('可选更新：重启并更新', async () => {
    ready('update-available');
    const user = userEvent.setup();
    render(<UpdatePrompt />);

    expect(screen.getByText(/0\.10\.0/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /restart to update/i }));

    expect(shell.apply).toHaveBeenCalledWith('0.10.0');
  });

  it('跳过此版本：记住并收起', async () => {
    ready('update-available');
    const user = userEvent.setup();
    const { container } = render(<UpdatePrompt />);

    await user.click(screen.getByRole('button', { name: /skip this version/i }));

    expect(useUpdateStore.getState().skippedVersion).toBe('0.10.0');
    expect(container).toBeEmptyDOMElement();
  });

  it('稍后：本次收起，不记为跳过；出现更新的版本时再提示', async () => {
    ready('update-available');
    const user = userEvent.setup();
    const { container } = render(<UpdatePrompt />);

    await user.click(screen.getByRole('button', { name: /later/i }));
    expect(container).toBeEmptyDOMElement();
    expect(useUpdateStore.getState().skippedVersion).toBeNull();

    ready('update-available', '0.11.0');
    expect(await screen.findByText(/0\.11\.0/)).toBeInTheDocument();
  });

  it('必须更新：说明原因，没有「跳过此版本」', () => {
    ready('client-too-old', '1.0.0');
    render(<UpdatePrompt />);

    expect(screen.getByText(/to keep syncing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skip this version/i })).toBeNull();
  });

  it('Android：按钮是下载', async () => {
    setUpdateShell({ ...shell, action: 'download' });
    ready('update-available');
    const user = userEvent.setup();
    render(<UpdatePrompt />);

    await user.click(screen.getByRole('button', { name: /download/i }));
    expect(shell.apply).toHaveBeenCalledWith('0.10.0');
  });

  it('安装失败：提示失败，可以重试', async () => {
    ready('update-available');
    shell.apply.mockRejectedValueOnce(new Error('signature mismatch'));
    const user = userEvent.setup();
    render(<UpdatePrompt />);

    await user.click(screen.getByRole('button', { name: /restart to update/i }));

    expect(await screen.findByText(/couldn't install/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart to update/i })).toBeEnabled();
  });
});
