import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

import { Start } from '@taskora/shared';
import type { ScheduledFieldPatch } from './fieldProps';

import { RepeatRuleField } from './RepeatRuleField';

/* ------------- helpers ------------- */

/**
 * 有状态 harness：patch 即时回灌 current，模拟真实缓存更新下的连续编辑。
 * 组件为独立入口，仅挂在 DATE 型任务上（入口可见性由调用方把关）。
 */
function renderField(
  initial: {
    start: Start;
    scheduledDate?: string | null;
    repeatRule?: unknown;
  },
  options: { onPatch?: ReturnType<typeof vi.fn> } = {},
) {
  const onPatch = options.onPatch ?? vi.fn();
  function Harness() {
    const [current, setCurrent] = React.useState(initial);
    const handlePatch = (patch: ScheduledFieldPatch) => {
      onPatch(patch);
      setCurrent((prev) => ({ ...prev, ...patch }) as typeof prev);
    };
    return <RepeatRuleField current={current as never} onPatch={handlePatch} />;
  }
  render(<Harness />);
  return { onPatch };
}

/* ------------- tests ------------- */

describe('RepeatRuleField — 独立重复规则编辑字段（recurring-tasks spec）', () => {
  it('开启开关 → 默认每周规则（从计划日期算）；关闭 → 清除规则', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
    });
    expect(screen.getByRole('switch', { name: /Repeat|重复/ })).toBeInTheDocument();

    // 开启：默认每周、从计划日期算
    await user.click(screen.getByRole('switch', { name: /Repeat|重复/ }));
    expect(onPatch).toHaveBeenCalledWith({
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
  });

  it('已有规则时关闭开关 → 清除规则（patch null）', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    await user.click(screen.getByRole('switch', { name: /Repeat|重复/ }));
    expect(onPatch).toHaveBeenLastCalledWith({ repeatRule: null });
  });

  it('关闭时只显示预设，点预设直接开启对应规则；不渲染规则控件', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({ start: Start.ANYTIME, scheduledDate: '2026-02-05' });
    expect(
      screen.queryByRole('radiogroup', { name: /Repeat unit|重复单位/ }),
    ).not.toBeInTheDocument();
    const presets = screen.getByRole('group', { name: /Common repeats|常用重复/ });
    await user.click(within(presets).getByRole('button', { name: /^(Weekdays|工作日)$/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5], anchor: 'scheduled' },
    });
    // 开启后预设收起，换成规则控件
    expect(
      screen.queryByRole('group', { name: /Common repeats|常用重复/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /Repeat unit|重复单位/ })).toBeInTheDocument();
  });

  it('已有规则：改单位 / 调间隔 / 切星期 / until 各自 patch 完整规则', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 2, anchor: 'scheduled' },
    });

    // 间隔 +1 → 3
    await user.click(screen.getByRole('button', { name: /Increase repeat interval|增大重复间隔/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'day', interval: 3, anchor: 'scheduled' },
    });

    // 单位 → week（携带 weekdays 编辑入口）
    await user.click(screen.getByRole('radio', { name: /^(weeks|周)$/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 3, anchor: 'scheduled' },
    });

    // 切一个星期几（周一）→ weekdays 数组
    await user.click(screen.getByRole('button', { name: /^Monday$|^星期一$/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 3, weekdays: [1], anchor: 'scheduled' },
    });

    // 结束日期：点开日历选当月 20 号
    await user.click(screen.getByRole('button', { name: /^(Ends|结束)$/ }));
    const today = new Date();
    const until = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-20`;
    await user.click(screen.getByRole('button', { name: new RegExp(`\\b20(th)?\\b|20日`) }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 3, weekdays: [1], anchor: 'scheduled', until },
    });

    // 清除结束日期
    await user.click(screen.getByRole('button', { name: /^(Ends|结束)$/ }));
    await user.click(screen.getByRole('button', { name: /^(Clear|清除)$/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 3, weekdays: [1], anchor: 'scheduled' },
    });
  });

  it('模式隔离：完成后剥离星期且不显示星期条；切回按日程恢复原星期', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'week', interval: 1, weekdays: [1, 3], anchor: 'scheduled' },
    });
    const pickMode = async (name: RegExp) => {
      await user.click(screen.getByRole('button', { name: /Repeat mode|重复方式/ }));
      const mode = screen.getByRole('radiogroup', { name: /Repeat mode|重复方式/ });
      await user.click(within(mode).getByRole('radio', { name }));
    };

    await pickMode(/^(After completion|完成后)/);
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 1, anchor: 'completion' },
    });
    expect(
      screen.queryByRole('group', { name: /Repeat weekdays|周模式星期几/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle(/If done today, next|若今天完成，下次/)).toBeInTheDocument();

    await pickMode(/^(On schedule|按日程)/);
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 1, weekdays: [1, 3], anchor: 'scheduled' },
    });
  });

  it('存量「完成后 + 星期」规则：按完成后展示，下一次编辑时规整掉星期', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'week', interval: 1, weekdays: [1], anchor: 'completion' },
    });
    expect(
      screen.queryByRole('group', { name: /Repeat weekdays|周模式星期几/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Increase repeat interval|增大重复间隔/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 2, anchor: 'completion' },
    });
  });

  it('按月：默认收起，展开后多选写入 monthDays，预览跟随；离开 month 剥离 monthDays', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'month', interval: 1, anchor: 'scheduled' },
    });
    // 收起：未选日子 = 计划日期当天
    expect(
      screen.queryByRole('group', { name: /Repeat days of the month|每月的几号/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Day 5 \(start date\)|5 号（同计划日期）/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^(Change|更改)$/ }));
    const grid = screen.getByRole('group', { name: /Repeat days of the month|每月的几号/ });
    expect(grid.querySelectorAll('button')).toHaveLength(31);

    await user.click(within(grid).getByRole('button', { name: '15' }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'month', interval: 1, monthDays: [15], anchor: 'scheduled' },
    });
    await user.click(within(grid).getByRole('button', { name: '1' }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'month', interval: 1, monthDays: [1, 15], anchor: 'scheduled' },
    });
    // 2026-02-05 之后的 [1,15] → 02-15
    expect(screen.getByText(/^(Next|下次)$/).nextSibling?.textContent).toMatch(/15/);

    // 31 显示为「末」，即最后一天
    await user.click(within(grid).getByRole('button', { name: /^(last day|最后一天)$/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'month', interval: 1, monthDays: [1, 15, 31], anchor: 'scheduled' },
    });

    await user.click(within(grid).getByRole('button', { name: '30' }));
    expect(screen.getByText(/Days 29–30|29、30 号/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /^(weeks|周)$/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
    expect(
      screen.queryByRole('group', { name: /Repeat days of the month|每月的几号/ }),
    ).not.toBeInTheDocument();
  });

  it('间隔可直接输入：合法即时 patch，清空失焦回显当前值，↑ 加一', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    const input = screen.getByRole('textbox', { name: /^(Repeat interval|重复间隔)$/ });

    await user.click(input);
    await user.keyboard('14');
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'day', interval: 14, anchor: 'scheduled' },
    });

    await user.keyboard('{ArrowUp}');
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'day', interval: 15, anchor: 'scheduled' },
    });

    // 清空不 patch；失焦回显当前值
    const calls = onPatch.mock.calls.length;
    await user.clear(input);
    await user.tab();
    expect(onPatch.mock.calls.length).toBe(calls);
    expect(input).toHaveValue('15');

    // 非数字字符被忽略
    await user.click(input);
    await user.keyboard('3a');
    expect(input).toHaveValue('3');
  });

  it('实时预览显示下一次出现日期（纯函数计算）', () => {
    renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    // 2026-02-05 + 1 天 = 02-06
    expect(screen.getByText(/^(Next|下次)$/).nextSibling?.textContent).toMatch(/6/);
  });

  it('until 已过：预览显示链终结', () => {
    renderField({
      start: Start.ANYTIME,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled', until: '2026-02-04' },
    });
    expect(screen.getByText(/No further occurrences|已到最后一次重复/)).toBeInTheDocument();
  });
});
