import { afterEach, describe, expect, it, vi } from 'vitest';
import { laterProjectKind, ProjectStatus, ScheduledType } from '@taskora/shared';
import { usePreferencesStore } from '@/stores/preferences.store';
import { projectLaterKind } from './date';

const base = {
  status: ProjectStatus.ACTIVE,
  trashedAt: null,
  scheduledType: ScheduledType.NONE,
  scheduledDate: null,
};

const originalZone = usePreferencesStore.getState().timeZone;
const originalLegacyZone = usePreferencesStore.getState().legacyDateTimeZone;
afterEach(() => {
  vi.useRealTimers();
  usePreferencesStore.setState({ timeZone: originalZone, legacyDateTimeZone: originalLegacyZone });
});

describe('laterProjectKind', () => {
  const today = '2026-09-28';

  it('Someday → someday；未来日期 → scheduled', () => {
    expect(laterProjectKind({ ...base, scheduledType: ScheduledType.SOMEDAY }, today)).toBe('someday');
    expect(
      laterProjectKind({ ...base, scheduledType: ScheduledType.DATE, scheduledDate: '2026-09-29' }, today),
    ).toBe('scheduled');
  });

  it('日期为今天或已过、未设日期均为活跃', () => {
    for (const scheduledDate of ['2026-09-28', '2026-09-01']) {
      expect(laterProjectKind({ ...base, scheduledType: ScheduledType.DATE, scheduledDate }, today)).toBeNull();
    }
    expect(laterProjectKind(base, today)).toBeNull();
  });

  it('已完成或在回收站的项目不是稍后项目', () => {
    const someday = { ...base, scheduledType: ScheduledType.SOMEDAY };
    expect(laterProjectKind({ ...someday, status: ProjectStatus.COMPLETED }, today)).toBeNull();
    expect(laterProjectKind({ ...someday, trashedAt: '2026-09-27T00:00:00.000Z' }, today)).toBeNull();
  });

  it('旧的非零点时间戳按 legacy 时区解码', () => {
    // 上海 2026-09-29 零点 = UTC 2026-09-28T16:00
    const project = { ...base, scheduledType: ScheduledType.DATE, scheduledDate: '2026-09-28T16:00:00.000Z' };
    expect(laterProjectKind(project, today, 'Asia/Shanghai')).toBe('scheduled');
    expect(laterProjectKind(project, today, 'UTC')).toBeNull();
  });

  it('客户端按账号时区的今天判定', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T20:00:00.000Z'));
    const project = { ...base, scheduledType: ScheduledType.DATE, scheduledDate: '2026-09-29' };
    usePreferencesStore.setState({ timeZone: 'UTC', legacyDateTimeZone: 'UTC' });
    expect(projectLaterKind(project)).toBe('scheduled');
    // 上海此刻已是 9 月 29 日
    usePreferencesStore.setState({ timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' });
    expect(projectLaterKind(project)).toBeNull();
  });
});
