import { describe, expect, it } from 'vitest';

import { normalizePreferences } from './preferences';

const defaults = { theme: 'system', language: 'en', weekStartsOn: 1, bucketGrouping: true } as const;

describe('normalizePreferences', () => {
  it('passes valid values through untouched', () => {
    expect(
      normalizePreferences(
        { theme: 'dark', language: 'zh', weekStartsOn: 0, bucketGrouping: false },
        defaults,
      ),
    ).toEqual({ theme: 'dark', language: 'zh', weekStartsOn: 0, bucketGrouping: false });
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
    ).toEqual({ theme: 'system', language: 'en', weekStartsOn: 1, bucketGrouping: true });
  });

  it('falls back to defaults for null / undefined / non-object inputs', () => {
    for (const bad of [null, undefined, 42, 'dark', true]) {
      expect(normalizePreferences(bad, defaults)).toEqual({
        theme: 'system',
        language: 'en',
        weekStartsOn: 1,
        bucketGrouping: true,
      });
    }
  });

  it('falls back per-field for partial objects (missing keys use defaults)', () => {
    expect(normalizePreferences({ theme: 'dark' }, defaults)).toEqual({
      theme: 'dark',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
    });
    expect(normalizePreferences({ language: 'zh' }, defaults)).toEqual({
      theme: 'system',
      language: 'zh',
      weekStartsOn: 1,
      bucketGrouping: true,
    });
  });

  it('null-valued fields fall back to defaults (null is not "0")', () => {
    expect(normalizePreferences({ weekStartsOn: null }, defaults).weekStartsOn).toBe(1);
    expect(normalizePreferences({ theme: null, language: null }, defaults)).toEqual({
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
    });
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
});
