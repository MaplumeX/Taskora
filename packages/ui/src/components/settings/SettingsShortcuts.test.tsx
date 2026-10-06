import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsShortcuts from './SettingsShortcuts';
import { useKeybindingsStore } from '@taskora/api';

const hotkey = vi.hoisted(() => ({
  current: 'CmdOrCtrl+Shift+Space',
  set: vi.fn(),
}));

vi.mock('@/components/keyboard/quickAddHotkey', () => ({
  getQuickAddAccelerator: () => Promise.resolve(hotkey.current),
  setQuickAddAccelerator: (accelerator: string | null) => hotkey.set(accelerator),
}));

function editButton(action: string) {
  return screen.getByRole('button', { name: `Change shortcut for “${action}”` });
}

describe('SettingsShortcuts', () => {
  beforeEach(() => {
    useKeybindingsStore.setState({ overrides: {} });
  });

  it('按平台列出默认键位', () => {
    render(<SettingsShortcuts platform="mac" />);
    expect(editButton('Complete selection')).toHaveTextContent('⌘K');
    expect(editButton('New project')).toHaveTextContent('⌥⌘N');
    expect(editButton('Delete selection')).toHaveTextContent('⌫⌦');
  });

  it('点击后按下新组合即改绑，并可恢复默认', async () => {
    const user = userEvent.setup();
    render(<SettingsShortcuts platform="mac" />);

    await user.click(editButton('Complete selection'));
    expect(editButton('Complete selection')).toHaveTextContent('Press shortcut…');
    fireEvent.keyDown(window, { key: 'd', code: 'KeyD', metaKey: true });

    expect(useKeybindingsStore.getState().overrides).toEqual({ complete: ['Meta+D'] });
    expect(editButton('Complete selection')).toHaveTextContent('⌘D');

    await user.click(screen.getByRole('button', { name: 'Restore default for “Complete selection”' }));
    expect(useKeybindingsStore.getState().overrides).toEqual({});
    expect(editButton('Complete selection')).toHaveTextContent('⌘K');
  });

  it('改绑到已占用的键位时从原动作移除', async () => {
    const user = userEvent.setup();
    render(<SettingsShortcuts platform="mac" />);

    await user.click(editButton('Quick Find'));
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', metaKey: true });

    expect(useKeybindingsStore.getState().overrides).toEqual({
      search: ['Meta+K'],
      complete: [],
    });
    expect(editButton('Complete selection')).toHaveTextContent('Not set');
  });

  it('Esc 取消录制，单按修饰键继续等待', async () => {
    const user = userEvent.setup();
    render(<SettingsShortcuts platform="windows" />);

    await user.click(editButton('New task'));
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    expect(editButton('New task')).toHaveTextContent('Press shortcut…');
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useKeybindingsStore.getState().overrides).toEqual({});
    expect(editButton('New task')).toHaveTextContent('Ctrl+N');
  });
});

describe('SettingsShortcuts — 快速添加（桌面）', () => {
  beforeEach(() => {
    useKeybindingsStore.setState({ overrides: {} });
    hotkey.current = 'CmdOrCtrl+Shift+Space';
    hotkey.set.mockReset();
    hotkey.set.mockImplementation((accelerator: string | null) =>
      Promise.resolve(accelerator ?? 'CmdOrCtrl+Shift+Space'),
    );
  });

  it('Web 不显示快速添加分组', () => {
    render(<SettingsShortcuts platform="web" />);
    expect(screen.queryByText('Quick Add')).toBeNull();
  });

  it('列出系统级与卡片内快捷键', async () => {
    render(<SettingsShortcuts platform="mac" desktopShell />);
    expect(await screen.findByText('⇧⌘Space')).toBeInTheDocument();
    expect(editButton('Set scheduled date')).toHaveTextContent('⌘S');
    expect(editButton('Add and continue')).toHaveTextContent('⇧⌘↵');
  });

  it('卡片内键位与主窗口键位互不冲突', async () => {
    const user = userEvent.setup();
    render(<SettingsShortcuts platform="mac" desktopShell />);
    await user.click(editButton('Set scheduled date'));
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', metaKey: true });
    expect(useKeybindingsStore.getState().overrides).toEqual({ quickAddWhen: ['Meta+K'] });
  });

  it('改绑系统级快捷键：转成 accelerator，并移除应用内同键位', async () => {
    const user = userEvent.setup();
    render(<SettingsShortcuts platform="mac" desktopShell />);
    await screen.findByText('⇧⌘Space');
    await user.click(editButton('Open Quick Add (system-wide)'));
    fireEvent.keyDown(window, { key: 'j', code: 'KeyJ', metaKey: true });

    expect(hotkey.set).toHaveBeenCalledWith('Super+J');
    await waitFor(() =>
      expect(useKeybindingsStore.getState().overrides).toEqual({ toggleAssistantPanel: [] }),
    );
    expect(editButton('Open Quick Add (system-wide)')).toHaveTextContent('⌘J');
    expect(editButton('Toggle assistant panel')).toHaveTextContent('Not set');
  });

  it('系统级快捷键不接受不带 Ctrl / Alt / ⌘ 的键位', async () => {
    const user = userEvent.setup();
    render(<SettingsShortcuts platform="mac" desktopShell />);
    await screen.findByText('⇧⌘Space');
    await user.click(editButton('Open Quick Add (system-wide)'));
    fireEvent.keyDown(window, { key: 'K', code: 'KeyK', shiftKey: true });
    expect(hotkey.set).not.toHaveBeenCalled();
  });

  it('应用内键位不能设为系统级快捷键', async () => {
    const user = userEvent.setup();
    render(<SettingsShortcuts platform="mac" desktopShell />);
    await screen.findByText('⇧⌘Space');
    await user.click(editButton('New task'));
    fireEvent.keyDown(window, { key: ' ', code: 'Space', metaKey: true, shiftKey: true });
    expect(useKeybindingsStore.getState().overrides).toEqual({});
  });
});
