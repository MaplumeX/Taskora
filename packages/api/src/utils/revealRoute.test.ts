import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';

import { usePreferencesStore } from '@/stores/preferences.store';
import { revealRouteFor, type RevealTarget } from './revealRoute';

const NOW = new Date('2026-02-05T04:00:00.000Z'); // 上海 2026-02-05 12:00

function target(partial: Partial<RevealTarget> = {}): RevealTarget {
  return {
    status: TaskStatus.ACTIVE,
    trashedAt: null,
    scheduledType: ScheduledType.DATE,
    scheduledDate: '2026-02-05',
    projectId: null,
    areaId: null,
    bucket: TaskBucket.SCHEDULED,
    ...partial,
  };
}

describe('revealRouteFor', () => {
  let previous: string;
  beforeEach(() => {
    previous = usePreferencesStore.getState().timeZone;
    usePreferencesStore.getState().setTimeZone('Asia/Shanghai');
  });
  afterEach(() => usePreferencesStore.getState().setTimeZone(previous));

  it('Today 可见（今天或已过的计划日期）优先于归属', () => {
    expect(revealRouteFor(target({ projectId: 'p1' }), { now: NOW })).toBe('/today');
    expect(
      revealRouteFor(target({ scheduledDate: '2026-02-01', areaId: 'a1' }), { now: NOW }),
    ).toBe('/today');
  });

  it('不在 Today：Project → Area', () => {
    const future = { scheduledDate: '2026-02-06' };
    expect(revealRouteFor(target({ ...future, projectId: 'p1', areaId: 'a1' }), { now: NOW })).toBe(
      '/projects/p1',
    );
    expect(revealRouteFor(target({ ...future, areaId: 'a1' }), { now: NOW })).toBe('/areas/a1');
  });

  it('无归属时按 Bucket 落位', () => {
    expect(revealRouteFor(target({ scheduledDate: '2026-02-06' }), { now: NOW })).toBe('/upcoming');
    expect(
      revealRouteFor(target({ scheduledType: ScheduledType.SOMEDAY, scheduledDate: null }), {
        now: NOW,
      }),
    ).toBe('/someday');
    const unscheduled = { scheduledType: ScheduledType.NONE, scheduledDate: null };
    expect(
      revealRouteFor(target({ ...unscheduled, bucket: TaskBucket.ANYTIME }), { now: NOW }),
    ).toBe('/anytime');
    expect(revealRouteFor(target({ ...unscheduled, bucket: TaskBucket.INBOX }), { now: NOW })).toBe(
      '/inbox',
    );
  });

  it('按账号时区判断「今天」', () => {
    // UTC 仍是 2月5日 20:00，但上海已是 2月6日 04:00 → 2月6日的任务属于 Today
    const lateUtc = new Date('2026-02-05T20:00:00.000Z');
    expect(revealRouteFor(target({ scheduledDate: '2026-02-06' }), { now: lateUtc })).toBe(
      '/today',
    );
  });

  it('已了结 → Logbook；已进 Trash → 不导航', () => {
    expect(revealRouteFor(target({ status: TaskStatus.COMPLETED }), { now: NOW })).toBe('/logbook');
    expect(revealRouteFor(target({ status: TaskStatus.CANCELLED }), { now: NOW })).toBe('/logbook');
    expect(
      revealRouteFor(target({ trashedAt: '2026-02-05T00:00:00.000Z' }), { now: NOW }),
    ).toBeNull();
    expect(
      revealRouteFor(target({ trashedAt: '2026-02-05T00:00:00.000Z' }), {
        now: NOW,
        allowTrash: true,
      }),
    ).toBe('/trash');
  });
});
