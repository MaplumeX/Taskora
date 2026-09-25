import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groupedViewCollapseKey } from './groupedViewCollapse.store';

const STORAGE_KEY = 'taskora-grouped-view-collapse';

/** Re-import the store module so zustand persist rehydrates from the current localStorage. */
async function importFresh() {
  vi.resetModules();
  return await import('./groupedViewCollapse.store');
}

function readPersistedState(): Record<string, unknown> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? ((JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? {}) : {};
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('useGroupedViewCollapseStore', () => {
  it('defaults every group to expanded (absence = expanded)', async () => {
    const { useGroupedViewCollapseStore: fresh } = await importFresh();
    expect(fresh.getState().collapsed).toEqual({});
    expect(fresh.getState().collapsed[groupedViewCollapseKey('today', 'proj-1')]).toBeUndefined();
  });

  it('records collapse per view per parent independently', async () => {
    const { useGroupedViewCollapseStore: fresh } = await importFresh();
    fresh.getState().setCollapsed('today', 'proj-1', true);

    const { collapsed } = fresh.getState();
    expect(collapsed[groupedViewCollapseKey('today', 'proj-1')]).toBe(true);
    // 同一父级在别的视图、同一视图的其他父级都不受影响。
    expect(collapsed[groupedViewCollapseKey('anytime', 'proj-1')]).toBeUndefined();
    expect(collapsed[groupedViewCollapseKey('today', 'proj-2')]).toBeUndefined();
  });

  it('re-expanding removes the record (absence = expanded)', async () => {
    const { useGroupedViewCollapseStore: fresh } = await importFresh();
    fresh.getState().setCollapsed('today', 'proj-1', true);
    fresh.getState().setCollapsed('today', 'proj-1', false);
    expect(fresh.getState().collapsed).toEqual({});
  });

  it('persists only the collapsed map and rehydrates from localStorage', async () => {
    const { useGroupedViewCollapseStore: fresh } = await importFresh();
    fresh.getState().setCollapsed('someday', 'area-1', true);

    expect(readPersistedState()).toEqual({
      collapsed: { [groupedViewCollapseKey('someday', 'area-1')]: true },
    });

    const { useGroupedViewCollapseStore: rehydrated } = await importFresh();
    expect(rehydrated.getState().collapsed).toEqual({
      [groupedViewCollapseKey('someday', 'area-1')]: true,
    });
  });
});
