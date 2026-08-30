import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePreferencesStore } from './preferences.store';

const STORAGE_KEY = 'taskora-week-starts';

/**
 * Regression test: the persisted `weekStartsOn` may be a string (older
 * hand-written localStorage entry) or missing. Without normalization,
 * `anchor.getDay() - '1'` poisons date math and produces `Invalid Date`,
 * crashing the calendar week view with `RangeError: Invalid time value`.
 */
describe('usePreferencesStore persisted weekStartsOn normalization', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({ weekStartsOn: 1 });
  });

  function readPersistedWeekStartsOn(): unknown {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { state?: { weekStartsOn?: unknown } }).state?.weekStartsOn : undefined;
  }

  it('falls back to 1 when localStorage has no stored state', async () => {
    window.localStorage.removeItem(STORAGE_KEY);
    const { usePreferencesStore: fresh } = await importFresh();
    expect(fresh.getState().weekStartsOn).toBe(1);
  });

  it('normalizes a persisted string "0" to the number 0', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { weekStartsOn: '0' }, version: 0 }));
    const { usePreferencesStore: fresh } = await importFresh();
    expect(fresh.getState().weekStartsOn).toBe(0);
  });

  it('normalizes a persisted string "1" to the number 1', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { weekStartsOn: '1' }, version: 0 }));
    const { usePreferencesStore: fresh } = await importFresh();
    expect(fresh.getState().weekStartsOn).toBe(1);
  });

  it('normalizes garbage persisted values (undefined / null / object) to 1', async () => {
    for (const bad of [undefined, null, { weekStartsOn: 'x' }]) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state: { weekStartsOn: bad }, version: 0 }),
      );
      const { usePreferencesStore: fresh } = await importFresh();
      expect(fresh.getState().weekStartsOn).toBe(1);
    }
  });

  it('keeps a valid persisted number 0 untouched', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { weekStartsOn: 0 }, version: 0 }));
    const { usePreferencesStore: fresh } = await importFresh();
    expect(fresh.getState().weekStartsOn).toBe(0);
  });

  it('persists a valid number back on setWeekStartsOn', () => {
    usePreferencesStore.getState().setWeekStartsOn(0);
    expect(readPersistedWeekStartsOn()).toBe(0);
    usePreferencesStore.getState().setWeekStartsOn(1);
    expect(readPersistedWeekStartsOn()).toBe(1);
  });
});

/** Re-import the store module so zustand persist rehydrates from the current localStorage. */
async function importFresh() {
  vi.resetModules();
  return await import('./preferences.store');
}
