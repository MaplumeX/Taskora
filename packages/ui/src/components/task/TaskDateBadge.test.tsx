import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatShortDate } from '@taskora/api';

import { TaskDateBadge } from './TaskDateBadge';
import { TaskTodayBadge } from './TaskTodayBadge';

function localDateIso(offsetDays: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

describe('TaskDateBadge / TaskTodayBadge — When 的「今天」语义（参考 Things 3）', () => {
  // 固定「今天」为 2026-09-25，保证 ±N 天偏移确定。
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('未来日期渲染灰色短日期 chip', () => {
    const iso = localDateIso(5);
    const { container } = render(<TaskDateBadge scheduledDate={iso} />);
    const chip = container.querySelector('span');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe(formatShortDate(new Date(iso)));
    // 未来日期不再携带警示色（红色只属于 Deadline）。
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('今天的日期不渲染日期 chip（由黄星/列表语境表达）', () => {
    const { container } = render(<TaskDateBadge scheduledDate={localDateIso(0)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('逾期日期不渲染日期 chip——When 永不逾期，不显示红色过期日期', () => {
    const { container } = render(<TaskDateBadge scheduledDate={localDateIso(-3)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('null 日期不渲染', () => {
    const { container } = render(<TaskDateBadge scheduledDate={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('黄星徽标渲染 amber 星形图标（≤ 今天的「今天」语义）', () => {
    const { container } = render(<TaskTodayBadge />);
    const star = container.querySelector('svg');
    expect(star).not.toBeNull();
    expect(star!.classList.contains('text-amber-400')).toBe(true);
  });
});
