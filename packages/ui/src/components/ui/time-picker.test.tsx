import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FieldPicker } from '@/components/common/FieldPicker';
import { mockDesktop } from '@/test/media';

import { TimePicker } from './time-picker';

describe.each([false, true])('TimePicker inside FieldPicker (desktop: %s)', (desktop) => {
  let restoreMedia: () => void;
  afterEach(() => restoreMedia?.());

  async function openPicker() {
    restoreMedia = mockDesktop(desktop);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onHostClick = vi.fn();
    render(
      <div onClick={onHostClick}>
        <FieldPicker label="Scheduled date" trigger={<button type="button">Open date</button>}>
          <div data-testid="date-blank">Date card blank space</div>
          <button type="button">Other date control</button>
          <TimePicker
            value="09:00"
            onChange={onChange}
            aria-label="Reminder time"
            hourLabel="Hour"
            minuteLabel="Minute"
          />
        </FieldPicker>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Open date' }));
    await user.click(screen.getByRole('button', { name: 'Reminder time' }));
    expect(screen.getByRole('listbox', { name: 'Hour' })).toBeInTheDocument();
    onHostClick.mockClear();
    return { user, onChange, onHostClick };
  }

  it('closes on a click in the date card blank space without closing the card or clicking the host', async () => {
    const { user, onHostClick } = await openPicker();

    await user.click(screen.getByTestId('date-blank'));

    await waitFor(() => expect(screen.queryAllByRole('listbox')).toHaveLength(0));
    expect(screen.getByTestId('date-blank')).toBeInTheDocument();
    expect(onHostClick).not.toHaveBeenCalled();
  });

  it('keeps the columns open when selecting a time and closes from its trigger', async () => {
    const { user, onChange, onHostClick } = await openPicker();

    await user.click(
      within(screen.getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: '18' }),
    );
    expect(onChange).toHaveBeenLastCalledWith('18:00');
    expect(screen.getByRole('listbox', { name: 'Minute' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reminder time' }));
    await waitFor(() => expect(screen.queryAllByRole('listbox')).toHaveLength(0));
    expect(screen.getByTestId('date-blank')).toBeInTheDocument();
    expect(onHostClick).not.toHaveBeenCalled();
  });

  it('closes on a touch tap in the date card blank space', async () => {
    const { user, onHostClick } = await openPicker();

    await user.pointer([
      { keys: '[TouchA>]', target: screen.getByTestId('date-blank') },
      { keys: '[/TouchA]' },
    ]);

    await waitFor(() => expect(screen.queryAllByRole('listbox')).toHaveLength(0));
    expect(screen.getByTestId('date-blank')).toBeInTheDocument();
    expect(onHostClick).not.toHaveBeenCalled();
  });

  it('keeps the clicked outside control focused after closing', async () => {
    const { user } = await openPicker();
    const control = screen.getByRole('button', { name: 'Other date control' });

    await user.click(control);

    await waitFor(() => expect(screen.queryAllByRole('listbox')).toHaveLength(0));
    await waitFor(() => expect(control).toHaveFocus());
  });

  it('keeps the picker open during scrolling and restores trigger focus on Escape', async () => {
    const { user } = await openPicker();
    const column = screen.getByRole('listbox', { name: 'Hour' });
    fireEvent.wheel(column, { deltaY: 40 });
    fireEvent.touchMove(column);
    expect(column).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryAllByRole('listbox')).toHaveLength(0));
    expect(screen.getByTestId('date-blank')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reminder time' })).toHaveFocus(),
    );
  });
});
