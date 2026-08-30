import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserPreferences } from '@taskora/shared';

import type { Language } from '@/lib/utils/preferences';


const STORAGE_KEY = 'taskora-preferences';
const LEGACY_THEME_KEY = 'taskora-theme';
const LEGACY_WEEK_STARTS_KEY = 'taskora-week-starts';
const LEGACY_LANG_KEY = 'taskora-lang';

function readPersistedState(): Record<string, unknown> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? ((JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? {}) : {};
}

/** Re-import the store module so zustand persist rehydrates from the current localStorage. */
async function importFresh() {
  vi.resetModules();
  return await import('./preferences.store');
}

function setPersisted(state: Record<string, unknown>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 0 }));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('usePreferencesStore persisted state normalization', () => {
  it('falls back to defaults when localStorage has no stored state', async () => {
    const { usePreferencesStore: fresh } = await importFresh();
    const state = fresh.getState();
    expect(state.theme).toBe('system');
    expect(state.weekStartsOn).toBe(1);
    expect(['zh', 'en']).toContain(state.language);
  });

  it('normalizes a persisted string "0" weekStartsOn to the number 0', async () => {
    setPersisted({ theme: 'dark', language: 'en', weekStartsOn: '0' });
    const { usePreferencesStore: fresh } = await importFresh();
    expect(fresh.getState().weekStartsOn).toBe(0);
  });

  it('normalizes garbage persisted values to defaults', async () => {
    setPersisted({ theme: 'blue', language: 'fr', weekStartsOn: 'sunday' });
    const { usePreferencesStore: fresh } = await importFresh();
    const state = fresh.getState();
    expect(state.theme).toBe('system');
    expect(state.weekStartsOn).toBe(1);
    expect(['zh', 'en']).toContain(state.language);
  });

  it('keeps valid persisted values untouched', async () => {
    setPersisted({ theme: 'dark', language: 'zh', weekStartsOn: 0 });
    const { usePreferencesStore: fresh } = await importFresh();
    const state = fresh.getState();
    expect(state.theme).toBe('dark');
    expect(state.language).toBe('zh');
    expect(state.weekStartsOn).toBe(0);
  });

  it('persists the full triple on set actions', async () => {
    const { usePreferencesStore: fresh } = await importFresh();
    fresh.getState().setTheme('dark');
    fresh.getState().setLanguage('zh');
    fresh.getState().setWeekStartsOn(0);
    const persisted = readPersistedState();
    expect(persisted).toMatchObject({ theme: 'dark', language: 'zh', weekStartsOn: 0 });
  });
});

describe('usePreferencesStore legacy key migration', () => {
  it('migrates legacy theme / week-starts / lang keys when unified key is absent', async () => {
    window.localStorage.setItem(
      LEGACY_THEME_KEY,
      JSON.stringify({ state: { mode: 'dark' }, version: 0 }),
    );
    window.localStorage.setItem(
      LEGACY_WEEK_STARTS_KEY,
      JSON.stringify({ state: { weekStartsOn: '0' }, version: 0 }),
    );
    window.localStorage.setItem(LEGACY_LANG_KEY, 'zh');

    const { usePreferencesStore: fresh } = await importFresh();
    const state = fresh.getState();
    expect(state.theme).toBe('dark');
    expect(state.weekStartsOn).toBe(0); // legacy string "0" normalized
    expect(state.language).toBe('zh');
  });

  it('does not delete legacy keys after migration (rollback safety)', async () => {
    window.localStorage.setItem(
      LEGACY_THEME_KEY,
      JSON.stringify({ state: { mode: 'light' }, version: 0 }),
    );
    await importFresh();
    expect(window.localStorage.getItem(LEGACY_THEME_KEY)).not.toBeNull();
  });

  it('ignores legacy keys once the unified key exists', async () => {
    setPersisted({ theme: 'system', language: 'en', weekStartsOn: 1 });
    window.localStorage.setItem(
      LEGACY_THEME_KEY,
      JSON.stringify({ state: { mode: 'dark' }, version: 0 }),
    );
    const { usePreferencesStore: fresh } = await importFresh();
    expect(fresh.getState().theme).toBe('system');
  });

  it('corrupt legacy entries are ignored safely', async () => {
    window.localStorage.setItem(LEGACY_THEME_KEY, '{not json');
    window.localStorage.setItem(LEGACY_WEEK_STARTS_KEY, 'null');
    const { usePreferencesStore: fresh } = await importFresh();
    const state = fresh.getState();
    expect(state.theme).toBe('system');
    expect(state.weekStartsOn).toBe(1);
  });
});

describe('usePreferencesStore hydrateFromServer normalization', () => {
  async function freshStore() {
    const { usePreferencesStore: fresh } = await importFresh();
    return fresh;
  }

  it('normalizes dirty server payloads (string weekStartsOn, invalid theme)', async () => {
    const fresh = await freshStore();
    const dirty = {
      theme: 'blue',
      language: 'fr',
      weekStartsOn: '0',
    } as unknown as UserPreferences;
    fresh.getState().hydrateFromServer(dirty);
    const state = fresh.getState();
    expect(state.weekStartsOn).toBe(0); // string "0" → 0
    expect(state.theme).toBe('system'); // invalid theme → default
    expect(['zh', 'en']).toContain(state.language);
  });

  it('keeps current local values for missing server fields (partial payload)', async () => {
    const fresh = await freshStore();
    fresh.getState().setTheme('dark');
    fresh.getState().setLanguage('zh');
    fresh.getState().setWeekStartsOn(0);
    fresh.getState().hydrateFromServer({} as unknown as UserPreferences);
    const state = fresh.getState();
    expect(state.theme).toBe('dark');
    expect(state.language).toBe('zh');
    expect(state.weekStartsOn).toBe(0);
  });

  it('applies a fully valid server payload', async () => {
    const fresh = await freshStore();
    fresh.getState().hydrateFromServer({ theme: 'light', language: 'en', weekStartsOn: 1 });
    const state = fresh.getState();
    expect(state.theme).toBe('light');
    expect(state.language).toBe('en');
    expect(state.weekStartsOn).toBe(1);
  });

  it('null payload is a no-op', async () => {
    const fresh = await freshStore();
    fresh.getState().setTheme('dark');
    fresh.getState().hydrateFromServer(null);
    expect(fresh.getState().theme).toBe('dark');
  });

  it('updates i18n language as a side effect', async () => {
    const fresh = await freshStore();
    const { i18n } = await import('@/i18n/config');
    const before = i18n.language;
    const target: Language = before === 'zh' ? 'en' : 'zh';
    fresh.getState().hydrateFromServer({
      theme: 'system',
      language: target,
      weekStartsOn: 1,
    });
    await vi.waitFor(() => {
      expect(i18n.language).toBe(target);
    });
  });
});

describe('theme side effects', () => {
  it('setTheme toggles the dark class on the document root', async () => {
    const { usePreferencesStore: fresh } = await importFresh();
    fresh.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fresh.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('cycle rotates light → dark → system', async () => {
    const { usePreferencesStore: fresh } = await importFresh();
    fresh.getState().setTheme('light');
    fresh.getState().cycle();
    expect(fresh.getState().theme).toBe('dark');
    fresh.getState().cycle();
    expect(fresh.getState().theme).toBe('system');
    fresh.getState().cycle();
    expect(fresh.getState().theme).toBe('light');
  });
});

