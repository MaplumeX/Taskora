import { describe, expect, it } from 'vitest';

import { normalizePreferences } from './preferences';

const defaults = {
  theme: 'system',
  language: 'en',
  weekStartsOn: 1,
  bucketGrouping: true,
} as const;
const WEEKLY = { unit: 'week', count: 1 } as const;
const MONTHLY = { unit: 'month', count: 1 } as const;
const INITIAL_INTERVALS = { project: WEEKLY, area: MONTHLY };

describe('normalizePreferences', () => {
  it('validates account time zones and keeps the existing zone for missing/invalid values', () => {
    const initial = { ...defaults, timeZone: 'Asia/Shanghai' };
    expect(normalizePreferences({ timeZone: 'America/New_York' }, initial).timeZone).toBe(
      'America/New_York',
    );
    expect(normalizePreferences({ timeZone: 'invalid' }, initial).timeZone).toBe('Asia/Shanghai');
    expect(normalizePreferences({}, initial).timeZone).toBe('Asia/Shanghai');
  });
  it('passes valid values through untouched', () => {
    expect(
      normalizePreferences(
        { theme: 'dark', language: 'zh', weekStartsOn: 0, bucketGrouping: false },
        defaults,
      ),
    ).toEqual({
      timeZone: 'UTC',
      theme: 'dark',
      language: 'zh',
      weekStartsOn: 0,
      bucketGrouping: false,
      todayReviewedOn: null,
      defaultReviewIntervals: INITIAL_INTERVALS,
    });
  });

  it('normalizes legacy string "0" to number 0', () => {
    expect(normalizePreferences({ weekStartsOn: '0' }, defaults).weekStartsOn).toBe(0);
  });

  it('normalizes legacy string "1" to number 1', () => {
    expect(normalizePreferences({ weekStartsOn: '1' }, defaults).weekStartsOn).toBe(1);
  });

  it('falls back to defaults for garbage values', () => {
    expect(
      normalizePreferences(
        { theme: 'blue', language: 'fr', weekStartsOn: 'sunday', bucketGrouping: 'yes' },
        defaults,
      ),
    ).toEqual({
      timeZone: 'UTC',
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
      todayReviewedOn: null,
      defaultReviewIntervals: INITIAL_INTERVALS,
    });
  });

  it('falls back to defaults for null / undefined / non-object inputs', () => {
    for (const bad of [null, undefined, 42, 'dark', true]) {
      expect(normalizePreferences(bad, defaults)).toEqual({
        timeZone: 'UTC',
        theme: 'system',
        language: 'en',
        weekStartsOn: 1,
        bucketGrouping: true,
        todayReviewedOn: null,
        defaultReviewIntervals: INITIAL_INTERVALS,
      });
    }
  });

  it('falls back per-field for partial objects (missing keys use defaults)', () => {
    expect(normalizePreferences({ theme: 'dark' }, defaults)).toEqual({
      timeZone: 'UTC',
      theme: 'dark',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
      todayReviewedOn: null,
      defaultReviewIntervals: INITIAL_INTERVALS,
    });
    expect(normalizePreferences({ language: 'zh' }, defaults)).toEqual({
      timeZone: 'UTC',
      theme: 'system',
      language: 'zh',
      weekStartsOn: 1,
      bucketGrouping: true,
      todayReviewedOn: null,
      defaultReviewIntervals: INITIAL_INTERVALS,
    });
  });

  it('null-valued fields fall back to defaults (null is not "0")', () => {
    expect(normalizePreferences({ weekStartsOn: null }, defaults).weekStartsOn).toBe(1);
    expect(normalizePreferences({ theme: null, language: null }, defaults)).toEqual({
      timeZone: 'UTC',
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
      todayReviewedOn: null,
      defaultReviewIntervals: INITIAL_INTERVALS,
    });
  });

  it('keeps the later todayReviewedOn of payload and default; ignores dirty values', () => {
    const local = { ...defaults, todayReviewedOn: '2026-10-05' };
    expect(normalizePreferences({ todayReviewedOn: '2026-10-06' }, local).todayReviewedOn).toBe(
      '2026-10-06',
    );
    expect(normalizePreferences({ todayReviewedOn: '2026-10-01' }, local).todayReviewedOn).toBe(
      '2026-10-05',
    );
    expect(normalizePreferences({ todayReviewedOn: 'today' }, local).todayReviewedOn).toBe(
      '2026-10-05',
    );
    expect(normalizePreferences({}, defaults).todayReviewedOn).toBeNull();
  });

  it('accepts only real booleans for bucketGrouping (invalid/missing → default)', () => {
    expect(normalizePreferences({ bucketGrouping: false }, defaults).bucketGrouping).toBe(false);
    expect(normalizePreferences({ bucketGrouping: true }, defaults).bucketGrouping).toBe(true);
    for (const bad of ['false', 0, 1, null, undefined]) {
      expect(normalizePreferences({ bucketGrouping: bad }, defaults).bucketGrouping).toBe(true);
    }
    // 默认也可以来自调用方（本地现状）：false 默认 + 脏值 → false。
    expect(
      normalizePreferences({ bucketGrouping: 'no' }, { ...defaults, bucketGrouping: false })
        .bucketGrouping,
    ).toBe(false);
  });

  it('normalizes defaultReviewIntervals per tier: invalid tiers fall back to the local value or the initial one', () => {
    expect(
      normalizePreferences(
        {
          defaultReviewIntervals: {
            project: { unit: 'week', count: 2 },
            area: { unit: 'month', count: 3 },
          },
        },
        defaults,
      ).defaultReviewIntervals,
    ).toEqual({ project: { unit: 'week', count: 2 }, area: { unit: 'month', count: 3 } });
    const local = { project: { unit: 'day', count: 3 }, area: { unit: 'year', count: 1 } } as const;
    for (const dirty of [
      { unit: 'decade', count: 1 },
      { unit: 'week', count: 0 },
      { unit: 'week', count: 1.5 },
      { unit: 'week', count: '2' },
      'weekly',
      null,
    ]) {
      // 只有坏掉的那一档回退，其余档照收
      expect(
        normalizePreferences({ defaultReviewIntervals: { project: dirty, area: WEEKLY } }, defaults)
          .defaultReviewIntervals,
      ).toEqual({ project: WEEKLY, area: WEEKLY });
      expect(
        normalizePreferences(
          { defaultReviewIntervals: { project: WEEKLY, area: dirty } },
          { ...defaults, defaultReviewIntervals: local },
        ).defaultReviewIntervals,
      ).toEqual({ project: WEEKLY, area: local.area });
      expect(
        normalizePreferences({ defaultReviewIntervals: dirty }, defaults).defaultReviewIntervals,
      ).toEqual(INITIAL_INTERVALS);
    }
  });
});
