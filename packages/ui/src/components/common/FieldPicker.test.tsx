import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockDesktop } from '@/test/media';
import { FieldPicker } from './FieldPicker';

function renderPicker(onHostClick = vi.fn(), onHostKeyDown = vi.fn()) {
  render(
    <div onClick={onHostClick} onKeyDown={onHostKeyDown}>
      <FieldPicker label="Scheduled date" trigger={<button type="button">open</button>}>
        {(close) => (
          <button type="button" onClick={close}>
            pick
          </button>
        )}
      </FieldPicker>
    </div>,
  );
  return { onHostClick, onHostKeyDown };
}

describe('FieldPicker', () => {
  let restoreMedia: (() => void) | undefined;
  afterEach(() => restoreMedia?.());

  describe('narrow screens', () => {
    it('opens a titled modal dialog', async () => {
      const user = userEvent.setup();
      renderPicker();

      await user.click(screen.getByRole('button', { name: 'open' }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveAccessibleName('Scheduled date');
      expect(screen.getByRole('button', { name: 'pick' })).toBeInTheDocument();
      // 不自动聚焦首个控件（避免弹键盘），焦点落在卡片本身
      expect(dialog).toHaveFocus();
    });

    it('closes from the close button and from the field close callback', async () => {
      const user = userEvent.setup();
      renderPicker();

      await user.click(screen.getByRole('button', { name: 'open' }));
      await user.click(await screen.findByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'open' }));
      await user.click(await screen.findByRole('button', { name: 'pick' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('keeps clicks and Escape inside the dialog from reaching the host row', async () => {
      const user = userEvent.setup();
      const { onHostClick, onHostKeyDown } = renderPicker();

      await user.click(screen.getByRole('button', { name: 'open' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(dialog);
      fireEvent.keyDown(dialog, { key: 'Escape' });

      expect(onHostClick).not.toHaveBeenCalled();
      expect(onHostKeyDown).not.toHaveBeenCalled();
    });
  });

  describe('wide screens', () => {
    it('opens an anchored popover instead of a dialog', async () => {
      restoreMedia = mockDesktop(true);
      const user = userEvent.setup();
      renderPicker();

      await user.click(screen.getByRole('button', { name: 'open' }));

      expect(await screen.findByRole('button', { name: 'pick' })).toBeInTheDocument();
      // Radix Popover 内容同为 role="dialog"：以模态卡片独有的标题 / 关闭按钮区分
      expect(screen.queryByRole('dialog', { name: 'Scheduled date' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });
  });
});
