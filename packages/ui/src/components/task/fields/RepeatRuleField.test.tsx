import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

import { ScheduledType } from '@taskora/shared';
import type { ScheduledFieldPatch } from './fieldProps';

import { RepeatRuleField } from './RepeatRuleField';

/* ------------- helpers ------------- */

/**
 * 有状态 harness：patch 即时回灌 current，模拟真实缓存更新下的连续编辑。
 * 组件为独立入口，仅挂在 DATE 型任务上（入口可见性由调用方把关）。
 */
function renderField(
  initial: {
    scheduledType: ScheduledType;
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
      scheduledType: ScheduledType.DATE,
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
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    await user.click(screen.getByRole('switch', { name: /Repeat|重复/ }));
    expect(onPatch).toHaveBeenLastCalledWith({ repeatRule: null });
  });

  it('已有规则：改单位 / 调间隔 / 切星期 / 锚点 / until 各自 patch 完整规则', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderField({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 2, anchor: 'scheduled' },
    });

    // 间隔 +1 → 3
    await user.click(screen.getByRole('button', { name: /Increase repeat interval|增大重复间隔/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'day', interval: 3, anchor: 'scheduled' },
    });

    // 单位 → week（携带 weekdays 编辑入口）
    fireEvent.change(screen.getByLabelText(/Repeat unit|重复单位/), { target: { value: 'week' } });
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 3, anchor: 'scheduled' },
    });

    // 切一个星期几（周一）→ weekdays 数组
    await user.click(screen.getByRole('button', { name: /^Monday$|^星期一$/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 3, weekdays: [1], anchor: 'scheduled' },
    });

    // 锚点 → 从完成日期算
    await user.click(screen.getByRole('checkbox', { name: /After completion|从完成日期算/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: { unit: 'week', interval: 3, weekdays: [1], anchor: 'completion' },
    });

    // until 日期
    fireEvent.change(screen.getByLabelText(/Until|直到/), { target: { value: '2026-06-30' } });
    expect(onPatch).toHaveBeenLastCalledWith({
      repeatRule: {
        unit: 'week',
        interval: 3,
        weekdays: [1],
        anchor: 'completion',
        until: '2026-06-30',
      },
    });
  });

  it('实时预览显示下一次出现日期（纯函数计算）', () => {
    renderField({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    // 2026-02-05 + 1 天 = 02-06
    expect(screen.getByText(/Next:|下次：/)).toBeInTheDocument();
    expect(screen.getByText(/Next:|下次：/).textContent).toMatch(/6/);
  });

  it('until 已过：预览显示链终结', () => {
    renderField({
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-05',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled', until: '2026-02-04' },
    });
    expect(screen.getByText(/No further occurrences|已到最后一次重复/)).toBeInTheDocument();
  });
});
