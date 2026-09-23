import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduledType } from '@taskora/shared';

import { useReminderPermissionStore } from '@taskora/api';

import { ScheduledDateField } from './ScheduledDateField';

/* ------------- helpers ------------- */

const now = new Date(2026, 1, 4); // 2026-02-04，日历渲染稳定

function renderField(
  current: { scheduledType: ScheduledType; scheduledDate?: string | null; reminderTime?: string | null },
  options: { onPatch?: ReturnType<typeof vi.fn>; showReminder?: boolean } = {},
) {
  const onPatch = options.onPatch ?? vi.fn();
  render(
    <ScheduledDateField
      current={current}
      onPatch={onPatch}
      showReminder={options.showReminder}
    />,
  );
  return { onPatch };
}

/* ------------- tests ------------- */

describe('ScheduledDateField — Reminder 提醒区（reminders spec）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReminderPermissionStore.setState({
      permission: 'unknown',
      supported: false,
    });
  });

  it('DATE 任务且 showReminder 时显示提醒区；首次开启默认 09:00 并请求授权', async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => true);
    useReminderPermissionStore.setState({ request });

    const { onPatch } = renderField(
      { scheduledType: ScheduledType.DATE, scheduledDate: '2026-02-05' },
      { showReminder: true },
    );
    expect(screen.getByRole('switch', { name: /Reminder|提醒/ })).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Reminder|提醒/ }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({ reminderTime: '09:00' });
  });

  it('改时间 → patch 新时刻；关闭开关 → patch null（清提醒）', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField(
      { scheduledType: ScheduledType.DATE, scheduledDate: '2026-02-05', reminderTime: '09:00' },
      { showReminder: true },
    );

    const timeInput = screen.getByLabelText(/Reminder time|提醒时间/) as HTMLInputElement;
    expect(timeInput.value).toBe('09:00');
    expect(timeInput).toBeEnabled();

    // jsdom 对 <input type=time> 的逐键输入支持不稳，直接改值断言 patch 流
    fireEvent.change(timeInput, { target: { value: '18:30' } });
    expect(onPatch).toHaveBeenLastCalledWith({ reminderTime: '18:30' });

    await user.click(screen.getByRole('switch', { name: /Reminder|提醒/ }));
    expect(onPatch).toHaveBeenLastCalledWith({ reminderTime: null });
  });

  it('未开提醒时时间输入禁用', () => {
    renderField(
      { scheduledType: ScheduledType.DATE, scheduledDate: '2026-02-05' },
      { showReminder: true },
    );
    expect(screen.getByLabelText(/Reminder time|提醒时间/)).toBeDisabled();
  });

  it('Someday / 无日期任务、以及 showReminder=false（Project / web）不渲染提醒区', () => {
    const { rerender } = render(
      <ScheduledDateField
        current={{ scheduledType: ScheduledType.SOMEDAY }}
        onPatch={vi.fn()}
        showReminder
      />,
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Reminder time|提醒时间/)).not.toBeInTheDocument();

    rerender(
      <ScheduledDateField
        current={{ scheduledType: ScheduledType.NONE }}
        onPatch={vi.fn()}
        showReminder
      />,
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    // DATE 型但未启用提醒区（Project / web）→ 依旧隐藏
    rerender(
      <ScheduledDateField
        current={{ scheduledType: ScheduledType.DATE, scheduledDate: '2026-02-05' }}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('授权被拒：仍可保存提醒时刻，但显示禁用提示与跳转设置入口', async () => {
    const user = userEvent.setup();
    const openSettings = vi.fn(async () => undefined);
    useReminderPermissionStore.setState({
      permission: 'denied',
      supported: true,
      openSettings,
      refresh: vi.fn(async () => undefined), // 不让真实 refresh 覆盖状态
    });

    renderField(
      { scheduledType: ScheduledType.DATE, scheduledDate: '2026-02-05', reminderTime: '09:00' },
      { showReminder: true },
    );

    // 拒绝后开关与输入照常可用（保存意图不丢）
    const timeInput = screen.getByLabelText(/Reminder time|提醒时间/) as HTMLInputElement;
    expect(timeInput).toBeEnabled();

    expect(screen.getByText(/Notifications are disabled|系统通知已禁用/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open Settings|打开设置/ }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('DATE → Someday/Clear 时显式携带 reminderTime: null（Task 上下文）', async () => {
    const user = userEvent.setup();
    vi.setSystemTime(now);
    const { onPatch } = renderField(
      { scheduledType: ScheduledType.DATE, scheduledDate: '2026-02-05', reminderTime: '09:00' },
      { showReminder: true },
    );

    await user.click(screen.getByRole('button', { name: /^Someday$/ }));
    expect(onPatch).toHaveBeenCalledWith({ scheduledType: ScheduledType.SOMEDAY, reminderTime: null });

    await user.click(screen.getByRole('button', { name: /Clear|清除/ }));
    expect(onPatch).toHaveBeenCalledWith({
      scheduledType: ScheduledType.NONE,
      scheduledDate: null,
      reminderTime: null,
    });
  });

  it('从未询问过（unknown）：不显示禁用提示（story 14：不在启动/未询问时弹提示）', () => {
    useReminderPermissionStore.setState({
      permission: 'unknown',
      supported: true,
      refresh: vi.fn(async () => undefined),
    });
    renderField(
      { scheduledType: ScheduledType.DATE, scheduledDate: '2026-02-05', reminderTime: '09:00' },
      { showReminder: true },
    );
    expect(screen.queryByText(/Notifications are disabled|系统通知已禁用/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Settings|打开设置/ })).not.toBeInTheDocument();
  });

  it('点击「明天」→ patch 明天的日期（DATE 型）', async () => {
    const user = userEvent.setup();
    vi.setSystemTime(now);
    const { onPatch } = renderField(
      { scheduledType: ScheduledType.NONE },
      { showReminder: true },
    );

    await user.click(screen.getByRole('button', { name: /^Tomorrow|明天$/ }));
    const expected = new Date(2026, 1, 5);
    expected.setHours(0, 0, 0, 0);
    expect(onPatch).toHaveBeenCalledWith({
      scheduledType: ScheduledType.DATE,
      scheduledDate: expected.toISOString(),
    });
  });

  it('授权刷新在提醒区打开时触发（拒绝状态跨会话可见）', async () => {
    const refresh = vi.fn(async () => undefined);
    useReminderPermissionStore.setState({ refresh });

    renderField(
      { scheduledType: ScheduledType.DATE, scheduledDate: '2026-02-05' },
      { showReminder: true },
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
