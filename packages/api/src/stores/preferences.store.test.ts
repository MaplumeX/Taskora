import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserPreferences } from '@taskora/shared';

import type { Language } from '@/utils/preferences';

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
    setPersisted({ theme: 'dark', language: 'zh', weekStartsOn: 0, bucketGrouping: false });
    const { usePreferencesStore: fresh } = await importFresh();
    const state = fresh.getState();
    expect(state.theme).toBe('dark');
    expect(state.language).toBe('zh');
    expect(state.weekStartsOn).toBe(0);
    expect(state.bucketGrouping).toBe(false);
  });

  it('defaults bucketGrouping to true when persisted state is missing or dirty', async () => {
    const { usePreferencesStore: fresh } = await importFresh();
    expect(fresh.getState().bucketGrouping).toBe(true);

    setPersisted({ theme: 'dark', language: 'en', weekStartsOn: 1, bucketGrouping: 'yes' });
    const { usePreferencesStore: dirty } = await importFresh();
    expect(dirty.getState().bucketGrouping).toBe(true);
  });

  it('persists the full preference set on set actions', async () => {
    const { usePreferencesStore: fresh } = await importFresh();
    fresh.getState().setTheme('dark');
    fresh.getState().setLanguage('zh');
    fresh.getState().setWeekStartsOn(0);
    fresh.getState().setBucketGrouping(false);
    const persisted = readPersistedState();
    expect(persisted).toMatchObject({
      theme: 'dark',
      language: 'zh',
      weekStartsOn: 0,
      bucketGrouping: false,
    });
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
    fresh.getState().setBucketGrouping(false);
    fresh.getState().hydrateFromServer({} as unknown as UserPreferences);
    const state = fresh.getState();
    expect(state.theme).toBe('dark');
    expect(state.language).toBe('zh');
    expect(state.weekStartsOn).toBe(0);
    expect(state.bucketGrouping).toBe(false);
  });

  it('keeps todayReviewedOn monotonic across local marks and server payloads', async () => {
    const fresh = await freshStore();
    expect(fresh.getState().todayReviewedOn).toBeNull();
    expect(fresh.getState().markTodayReviewed('2026-10-06')).toBe(true);
    expect(fresh.getState().markTodayReviewed('2026-10-06')).toBe(false);
    expect(fresh.getState().markTodayReviewed('2026-10-05')).toBe(false);
    expect(fresh.getState().todayReviewedOn).toBe('2026-10-06');

    const base = {
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
    } as const;
    // 旧设备写回的较早日期、脏值都不回拨本地基线。
    fresh.getState().hydrateFromServer({ ...base, todayReviewedOn: '2026-10-01' });
    expect(fresh.getState().todayReviewedOn).toBe('2026-10-06');
    fresh.getState().hydrateFromServer({ ...base, todayReviewedOn: 'yesterday' });
    expect(fresh.getState().todayReviewedOn).toBe('2026-10-06');
    // 其他设备看过更晚的 Today：采用。
    fresh.getState().hydrateFromServer({ ...base, todayReviewedOn: '2026-10-07' });
    expect(fresh.getState().todayReviewedOn).toBe('2026-10-07');
    expect(readPersistedState().todayReviewedOn).toBe('2026-10-07');
  });

  it('accumulates seen keys across devices and prunes them on confirmation', async () => {
    const fresh = await freshStore();
    fresh.getState().markTodayReviewed('2026-10-07');
    expect(fresh.getState().markTodaySeen(['task:a@2026-10-08'])).toBe(true);
    expect(fresh.getState().markTodaySeen(['task:a@2026-10-08'])).toBe(false);

    const base = {
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
      todayReviewedOn: '2026-10-07',
    } as const;
    // 其他设备的单条已读并入，不覆盖本地。
    fresh.getState().hydrateFromServer({ ...base, todaySeenKeys: ['task:b@2026-10-09'] });
    expect(fresh.getState().todaySeenKeys).toEqual(['task:b@2026-10-09', 'task:a@2026-10-08']);
    expect(readPersistedState().todaySeenKeys).toEqual(fresh.getState().todaySeenKeys);

    fresh.getState().markTodayReviewed('2026-10-08');
    expect(fresh.getState().todaySeenKeys).toEqual(['task:b@2026-10-09']);
  });

  it('applies a valid server bucketGrouping flag and ignores dirty ones', async () => {
    const fresh = await freshStore();
    fresh.getState().hydrateFromServer({
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: false,
    });
    expect(fresh.getState().bucketGrouping).toBe(false);

    fresh.getState().hydrateFromServer({
      theme: 'system',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: 'yes',
    } as unknown as UserPreferences);
    // 脏值不覆盖本地：保持上一次的有效值。
    expect(fresh.getState().bucketGrouping).toBe(false);
  });

  it('persists both account and legacy decoding zones; remote updates keep the legacy zone fixed', async () => {
    const fresh = await freshStore();
    fresh.getState().hydrateFromServer({
      timeZone: 'Asia/Shanghai',
      legacyDateTimeZone: 'Asia/Shanghai',
    } as UserPreferences);
    fresh.getState().hydrateFromServer({
      timeZone: 'America/New_York',
      legacyDateTimeZone: 'Asia/Shanghai',
    } as UserPreferences);
    expect(fresh.getState().timeZone).toBe('America/New_York');
    expect(fresh.getState().legacyDateTimeZone).toBe('Asia/Shanghai');
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.state.timeZone).toBe('America/New_York');
    expect(persisted.state.legacyDateTimeZone).toBe('Asia/Shanghai');
    fresh.getState().hydrateFromServer({ theme: 'dark' } as UserPreferences);
    expect(fresh.getState().legacyDateTimeZone).toBe('Asia/Shanghai');
  });

  it('applies a fully valid server payload', async () => {
    const fresh = await freshStore();
    fresh.getState().hydrateFromServer({
      theme: 'light',
      language: 'en',
      weekStartsOn: 1,
      bucketGrouping: true,
    });
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
      bucketGrouping: true,
    });
    await vi.waitFor(() => {
      expect(i18n.language).toBe(target);
    });
  });
});

describe('theme side effects', () => {
  it('native system theme overrides stale WebView queries without changing the preference', async () => {
    const changes = new EventTarget();
    const media = { ...window.matchMedia('(prefers-color-scheme: dark)'), matches: true };
    media.addEventListener = changes.addEventListener.bind(changes);
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    try {
      const { usePreferencesStore: fresh, setSystemTheme } = await importFresh();
      expect(fresh.getState().resolved).toBe('dark');

      setSystemTheme('light');
      expect(fresh.getState()).toMatchObject({ theme: 'system', resolved: 'light' });
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(readPersistedState()).toMatchObject({ theme: 'system' });
      expect(readPersistedState()).not.toHaveProperty('resolved');

      // 延迟到达的媒体查询事件不能覆盖原生主题。
      changes.dispatchEvent(new Event('change'));
      expect(fresh.getState().resolved).toBe('light');

      fresh.getState().hydrateFromServer({
        theme: 'system',
        language: 'en',
        weekStartsOn: 1,
        bucketGrouping: true,
      });
      expect(fresh.getState().resolved).toBe('light');

      setSystemTheme('dark');
      expect(fresh.getState().resolved).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    } finally {
      matchMedia.mockRestore();
    }
  });

  it.each(['light', 'dark'] as const)(
    'native changes preserve manual %s and switching back uses the latest system theme',
    async (mode) => {
      const { usePreferencesStore: fresh, setSystemTheme } = await importFresh();
      fresh.getState().setTheme(mode);
      const opposite = mode === 'light' ? 'dark' : 'light';
      setSystemTheme(opposite);
      expect(fresh.getState()).toMatchObject({ theme: mode, resolved: mode });
      expect(document.documentElement.classList.contains('dark')).toBe(mode === 'dark');

      fresh.getState().setTheme('system');
      expect(fresh.getState().resolved).toBe(opposite);
      expect(document.documentElement.classList.contains('dark')).toBe(opposite === 'dark');

      setSystemTheme(null);
      const expected = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      expect(fresh.getState().resolved).toBe(expected);
    },
  );

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
