import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { setHaptics, undoHistory, useUndoPromptStore } from '@taskora/api';

import { UndoPrompt } from './UndoPrompt';

describe('UndoPrompt', () => {
  beforeEach(() => {
    useUndoPromptStore.setState({ open: false });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setHaptics(null);
  });

  it('摇一摇请求后展示最近一步的动作，确认即撤销并给触感', async () => {
    vi.spyOn(undoHistory, 'peek').mockResolvedValue('complete');
    const undo = vi.spyOn(undoHistory, 'undo').mockResolvedValue('complete');
    const impl = vi.fn();
    setHaptics(impl);
    render(<UndoPrompt />);

    act(() => useUndoPromptStore.getState().request());
    expect(await screen.findByRole('dialog')).toHaveTextContent(/完成|Complete/);
    await userEvent.click(screen.getByRole('button', { name: /^(撤销|Undo)$/ }));

    expect(undo).toHaveBeenCalledTimes(1);
    expect(impl).toHaveBeenCalledWith('confirm');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useUndoPromptStore.getState().open).toBe(false);
  });

  it('取消不撤销', async () => {
    vi.spyOn(undoHistory, 'peek').mockResolvedValue('move');
    const undo = vi.spyOn(undoHistory, 'undo');
    render(<UndoPrompt />);

    act(() => useUndoPromptStore.getState().request());
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /^(取消|Cancel)$/ }));

    expect(undo).not.toHaveBeenCalled();
    expect(useUndoPromptStore.getState().open).toBe(false);
  });

  it('没有可撤销的步骤时不弹出', async () => {
    vi.spyOn(undoHistory, 'peek').mockResolvedValue(null);
    render(<UndoPrompt />);

    act(() => useUndoPromptStore.getState().request());
    await waitFor(() => expect(useUndoPromptStore.getState().open).toBe(false));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
