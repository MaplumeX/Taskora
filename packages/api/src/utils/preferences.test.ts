import { describe, expect, it } from 'vitest';

import { normalizePreferences } from './preferences';

const defaults = { theme: 'system', language: 'en', weekStartsOn: 1 } as const;

describe('normalizePreferences', () => {
  it('passes valid values through untouched', () => {
    expect(
      normalizePreferences({ theme: 'dark', language: 'zh', weekStartsOn: 0 }, defaults),
    ).toEqual({ theme: 'dark', language: 'zh', weekStartsOn: 0 });
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
        { theme: 'blue', language: 'fr', weekStartsOn: 'sunday' },
        defaults,
      ),
    ).toEqual({ theme: 'system', language: 'en', weekStartsOn: 1 });
  });

  it('falls back to defaults for null / undefined / non-object inputs', () => {
    for (const bad of [null, undefined, 42, 'dark', true]) {
      expect(normalizePreferences(bad, defaults)).toEqual({
        theme: 'system',
        language: 'en',
        weekStartsOn: 1,
      });
    }
  });

  it('falls back per-field for partial objects (missing keys use defaults)', () => {
    expect(normalizePreferences({ theme: 'dark' }, defaults)).toEqual({
      theme: 'dark',
      language: 'en',
      weekStartsOn: 1,
    });
    expect(normalizePreferences({ language: 'zh' }, defaults)).toEqual({
      theme: 'system',
      language: 'zh',
      weekStartsOn: 1,
    });
  });

  it('null-valued fields fall back to defaults (null is not "0")', () => {
    expect(normalizePreferences({ weekStartsOn: null }, defaults).weekStartsOn).toBe(1);
    expect(normalizePreferences({ theme: null, language: null }, defaults)).toEqual({
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
    });
  });
});
