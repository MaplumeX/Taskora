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

  it('从完成日期算：「完成后 N 单位」，不带星期 / 日子', () => {
    const after = (unit: RepeatRule['unit'], interval: number): RepeatRule => ({
      unit,
      interval,
      anchor: 'completion',
    });
    expect(summary(after('day', 3), 'zh')).toBe('完成后 3 天');
    expect(summary(after('week', 1), 'zh')).toBe('完成后 1 周');
    expect(summary(after('day', 3), 'en')).toBe('3 days after completion');
    expect(summary(after('week', 1), 'en')).toBe('1 week after completion');
  });

  it('周一至周五全选显示为「工作日」', () => {
    expect(
      summary({ unit: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5], anchor: 'scheduled' }, 'zh'),
    ).toBe('每周 · 工作日');
  });
});
