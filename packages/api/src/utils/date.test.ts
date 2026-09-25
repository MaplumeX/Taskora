import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n/config';
import { formatDeadlineCountdown, formatShortDate } from './date';

function daysFromToday(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

describe('formatShortDate', () => {
  it('输出短绝对日期（月缩写 + 日，locale 感知）', () => {
    const date = daysFromToday(30);
    const expected = new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
    }).format(date);
    expect(formatShortDate(date)).toBe(expected);
  });
});

describe('formatDeadlineCountdown（参考 Things 3 的 deadline 倒计时）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0)); // 2026-09-25 周五
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('到期日显示 today', () => {
    expect(formatDeadlineCountdown(daysFromToday(0))).toBe(i18n.t('common:today'));
  });

  it('未来显示倒计时天数', () => {
    expect(formatDeadlineCountdown(daysFromToday(1))).toBe(i18n.t('common:daysLeft', { count: 1 }));
    expect(formatDeadlineCountdown(daysFromToday(5))).toBe(i18n.t('common:daysLeft', { count: 5 }));
  });

  it('逾期显示逾期天数', () => {
    expect(formatDeadlineCountdown(daysFromToday(-1))).toBe(
      i18n.t('common:daysPastDue', { count: 1 }),
    );
    expect(formatDeadlineCountdown(daysFromToday(-3))).toBe(
      i18n.t('common:daysPastDue', { count: 3 }),
    );
  });

  it('英文复数形式正确', async () => {
    await i18n.changeLanguage('en');
    try {
      expect(formatDeadlineCountdown(daysFromToday(1))).toBe('1 day left');
      expect(formatDeadlineCountdown(daysFromToday(2))).toBe('2 days left');
      expect(formatDeadlineCountdown(daysFromToday(-1))).toBe('1 day past due');
    } finally {
      await i18n.changeLanguage('zh');
    }
  });
});
