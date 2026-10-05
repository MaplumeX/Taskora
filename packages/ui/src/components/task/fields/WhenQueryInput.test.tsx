import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduledType } from '@taskora/shared';
import { usePreferencesStore, useReminderPermissionStore } from '@taskora/api';

import { DueDateField } from './DueDateField';
import { ScheduledDateField } from './ScheduledDateField';

// 2026-10-05（周一）10:00，账号时区 UTC
const originalZone = usePreferencesStore.getState().timeZone;
const originalWeekStart = usePreferencesStore.getState().weekStartsOn;

beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
  usePreferencesStore.setState({ timeZone: 'UTC', weekStartsOn: 1 });
  useReminderPermissionStore.setState({ permission: 'unknown', supported: false });
});

afterEach(() => {
  vi.useRealTimers();
  usePreferencesStore.setState({ timeZone: originalZone, weekStartsOn: originalWeekStart });
});

function renderScheduled(
  options: { showReminder?: boolean; scheduledType?: ScheduledType; reminderTime?: string } = {},
) {
  const onPatch = vi.fn();
  const onClose = vi.fn();
  render(
    <ScheduledDateField
      current={{
        scheduledType: options.scheduledType ?? ScheduledType.NONE,
        reminderTime: options.reminderTime ?? null,
      }}
      onPatch={onPatch}
      onClose={onClose}
      showReminder={options.showReminder}
    />,
  );
  return { onPatch, onClose, input: screen.getByRole('combobox') };
}

describe('ScheduledDateField — 自然语言输入', () => {
  it('输入为空时显示快捷项与日历；有输入时换成候选列表', async () => {
    const user = userEvent.setup();
    const { input } = renderScheduled();
    expect(screen.getByRole('button', { name: /^(Today|今天)$/ })).toBeInTheDocument();

    await user.type(input, 'next fri');
    expect(screen.queryByRole('button', { name: /^(Today|今天)$/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);

    await user.clear(input);
    expect(screen.getByRole('button', { name: /^(Today|今天)$/ })).toBeInTheDocument();
  });

  it('Enter 选中第一项，写入日期并关闭', async () => {
    const user = userEvent.setup();
    const { input, onPatch, onClose } = renderScheduled({ showReminder: true });
    await user.type(input, '下周五{Enter}');
    expect(onPatch).toHaveBeenCalledWith({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-16',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('↑↓ 移动高亮后 Enter', async () => {
    const user = userEvent.setup();
    const { input, onPatch } = renderScheduled();
    await user.type(input, '明');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPatch).toHaveBeenCalledWith({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2027-01-01',
    });
  });

  it('点击候选写入', async () => {
    const user = userEvent.setup();
    const { input, onPatch } = renderScheduled();
    await user.type(input, '12');
    await user.click(screen.getAllByRole('option')[0]);
    expect(onPatch).toHaveBeenCalledWith({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-12',
    });
  });

  it('可设提醒：带时刻的候选写入提醒并请求授权', async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => true);
    useReminderPermissionStore.setState({ request });
    const { input, onPatch } = renderScheduled({ showReminder: true });
    await user.type(input, '明天下午3点');
    expect(screen.getByRole('option')).toHaveTextContent('15:00');
    await user.keyboard('{Enter}');
    expect(onPatch).toHaveBeenCalledWith({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-06',
      reminderTime: '15:00',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('不可设提醒：忽略时刻', async () => {
    const user = userEvent.setup();
    const { input, onPatch } = renderScheduled();
    await user.type(input, 'tomorrow 3pm');
    expect(screen.getByRole('option')).not.toHaveTextContent('15:00');
    await user.keyboard('{Enter}');
    expect(onPatch).toHaveBeenCalledWith({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-06',
    });
  });

  it('不带时刻的日期不动已有提醒', async () => {
    const user = userEvent.setup();
    const { input, onPatch } = renderScheduled({
      showReminder: true,
      scheduledType: ScheduledType.DATE,
      reminderTime: '08:00',
    });
    await user.type(input, 'fri{Enter}');
    expect(onPatch).toHaveBeenCalledWith({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-09',
    });
  });

  it('Someday 与清除', async () => {
    const user = userEvent.setup();
    const { input, onPatch } = renderScheduled({
      showReminder: true,
      scheduledType: ScheduledType.DATE,
    });
    await user.type(input, 'someday{Enter}');
    expect(onPatch).toHaveBeenLastCalledWith({
      scheduledType: ScheduledType.SOMEDAY,
      reminderTime: null,
    });
    await user.clear(input);
    await user.type(input, '清除{Enter}');
    expect(onPatch).toHaveBeenLastCalledWith({
      scheduledType: ScheduledType.NONE,
      scheduledDate: null,
      reminderTime: null,
    });
  });

  it('无法识别时给出提示', async () => {
    const user = userEvent.setup();
    const { input, onPatch } = renderScheduled();
    await user.type(input, 'xyz{Enter}');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn't understand|无法识别/)).toBeInTheDocument();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('IME 组字中的 Enter 不选中', () => {
    const { input, onPatch } = renderScheduled();
    fireEvent.change(input, { target: { value: '明天' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPatch).toHaveBeenCalledTimes(1);
  });
});

describe('DueDateField — 自然语言输入', () => {
  function renderDue() {
    const onPatch = vi.fn();
    const onClose = vi.fn();
    render(<DueDateField current={{ dueDate: null }} onPatch={onPatch} onClose={onClose} />);
    return { onPatch, onClose, input: screen.getByRole('combobox') };
  }

  it('写入截止日期并关闭；时刻只取日期', async () => {
    const user = userEvent.setup();
    const { input, onPatch, onClose } = renderDue();
    await user.type(input, '两周后 9点{Enter}');
    expect(onPatch).toHaveBeenCalledWith({ dueDate: '2026-10-19' });
    expect(onClose).toHaveBeenCalled();
  });

  it('没有 Someday', async () => {
    const user = userEvent.setup();
    const { input } = renderDue();
    await user.type(input, 'someday');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('清除', async () => {
    const user = userEvent.setup();
    const { input, onPatch } = renderDue();
    await user.type(input, 'clear{Enter}');
    expect(onPatch).toHaveBeenCalledWith({ dueDate: null });
  });
});
