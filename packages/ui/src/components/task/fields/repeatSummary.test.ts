import { describe, expect, it } from 'vitest';
import i18n from 'i18next';

import type { RepeatRule } from '@taskora/shared';

import { formatRepeatSummary } from './repeatSummary';

const summary = (rule: RepeatRule, language: 'zh' | 'en') =>
  formatRepeatSummary(rule, { t: i18n.getFixedT(language), language, weekStartsOn: 1 });

describe('formatRepeatSummary', () => {
  const monthly = (monthDays?: number[]): RepeatRule => ({
    unit: 'month',
    interval: 1,
    anchor: 'scheduled',
    ...(monthDays ? { monthDays } : {}),
  });

  it('按月的日子：列出日子，31 显示为最后一天', () => {
    expect(summary(monthly(), 'zh')).toBe('每月');
    expect(summary(monthly([1, 15]), 'zh')).toBe('每月 · 1、15 号');
    expect(summary(monthly([15, 31]), 'zh')).toBe('每月 · 15 号、最后一天');
    expect(summary(monthly([31]), 'zh')).toBe('每月 · 最后一天');
    expect(summary(monthly([1, 15]), 'en')).toBe('Monthly · day 1, 15');
    expect(summary(monthly([31]), 'en')).toBe('Monthly · last day');
  });

  it('按周的星期几不变', () => {
    expect(
      summary({ unit: 'week', interval: 2, weekdays: [1, 3], anchor: 'scheduled' }, 'zh'),
    ).toMatch(/^每 2 周 · 周一、周三$/);
  });
});
