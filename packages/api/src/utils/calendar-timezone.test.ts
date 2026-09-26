import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calendarDateKey,
  calendarDateStorage,
  calendarTimeInstant,
  instantDateKey,
  isValidTimeZone,
  ScheduledType,
  TaskStatus,
  TaskBucket,
} from '@taskora/shared';
import { usePreferencesStore } from '@/stores/preferences.store';
import { todayDateKey, parseCalendarDate, toInputDateValue, formatDeadlineCountdown } from './date';
import { i18n } from '@/i18n/config';
import { computeReminderPlan } from '../reminders/reminder-scheduler';
import { taskMatchesQuery } from '../events/task-query-match';
import { groupLogbookItems } from './logbookLayout';

const originalZone = usePreferencesStore.getState().timeZone;
const originalLegacyZone = usePreferencesStore.getState().legacyDateTimeZone;
afterEach(() => {
  vi.useRealTimers();
  usePreferencesStore.setState({ timeZone: originalZone, legacyDateTimeZone: originalLegacyZone });
});

describe('日历日期与账号时区（不依赖测试进程 TZ）', () => {
  it('UTC+8 旧零点 ISO 恢复日期；纯日期和 UTC 零点编码在西半球不漂移', () => {
    expect(calendarDateKey('2026-09-23T16:00Z', 'Asia/Shanghai')).toBe('2026-09-24');
    for (const zone of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
      expect(calendarDateKey('2026-09-24', zone)).toBe('2026-09-24');
      expect(calendarDateKey('2026-09-24T00:00Z', zone)).toBe('2026-09-24');
      expect(calendarDateStorage('2026-09-24', zone).toISOString()).toBe(
        '2026-09-24T00:00:00.000Z',
      );
      usePreferencesStore.getState().setTimeZone(zone);
      expect(toInputDateValue(parseCalendarDate('2026-09-24'))).toBe('2026-09-24');
    }
  });

  it('切换账号时区不移动旧 ISO 计划日期', () => {
    usePreferencesStore.setState({
      timeZone: 'Asia/Shanghai',
      legacyDateTimeZone: 'Asia/Shanghai',
    });
    expect(toInputDateValue(parseCalendarDate('2026-09-23T16:00Z'))).toBe('2026-09-24');
    usePreferencesStore.getState().setTimeZone('America/Los_Angeles');
    expect(toInputDateValue(parseCalendarDate('2026-09-23T16:00Z'))).toBe('2026-09-24');
  });

  it('同一时刻的 today、任务视图及 Deadline 统一使用账号时区', () => {
    const now = new Date('2026-09-23T17:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    usePreferencesStore.getState().setTimeZone('Asia/Shanghai');
    expect(todayDateKey()).toBe('2026-09-24');
    expect(instantDateKey(now, 'America/Los_Angeles')).toBe('2026-09-23');
    expect(formatDeadlineCountdown(parseCalendarDate('2026-09-24'))).toBe(i18n.t('common:today'));
    const task = {
      status: TaskStatus.ACTIVE,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-09-24',
      trashedAt: null,
      bucket: TaskBucket.SCHEDULED,
    } as Parameters<typeof taskMatchesQuery>[0];
    expect(taskMatchesQuery(task, { view: 'today' }, now)).toBe(true);
    expect(taskMatchesQuery(task, { view: 'upcoming' }, now)).toBe(false);
    usePreferencesStore.getState().setTimeZone('America/Los_Angeles');
    expect(taskMatchesQuery(task, { view: 'today' }, now)).toBe(false);
    expect(taskMatchesQuery(task, { view: 'upcoming' }, now)).toBe(true);
  });

  it('Logbook 的跨日分组按了结时刻在账号时区的日期', () => {
    usePreferencesStore.getState().setTimeZone('Asia/Shanghai');
    const items = [{ id: 't', completedAt: '2026-09-23T17:00Z' }] as Parameters<
      typeof groupLogbookItems
    >[0];
    expect(groupLogbookItems(items, new Date('2026-09-24T03:00Z'))[0].label).toBe(
      i18n.t('common:today'),
    );
  });

  it('提醒按账号墙上时钟触发，夏令时缺失向后移动、重复时刻取较早一次', () => {
    expect(
      new Date(calendarTimeInstant('2026-09-24', '09:00', 'Asia/Shanghai')).toISOString(),
    ).toBe('2026-09-24T01:00:00.000Z');
    expect(
      new Date(calendarTimeInstant('2026-03-08', '02:30', 'America/New_York')).toISOString(),
    ).toBe('2026-03-08T07:30:00.000Z');
    expect(
      new Date(calendarTimeInstant('2026-11-01', '01:30', 'America/New_York')).toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z');
    const task = {
      id: 't',
      title: '提醒',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-09-24',
      reminderTime: '09:00',
      status: TaskStatus.ACTIVE,
      trashedAt: null,
    };
    const [notification] = computeReminderPlan(
      [task],
      new Date('2026-09-23T00:00Z'),
      'Asia/Shanghai',
    );
    expect(notification.fireAt).toBe(Date.parse('2026-09-24T01:00Z'));
  });

  it('拒绝无效日期和非法时区，而不是偷偷按服务器时区计算', () => {
    expect(() => calendarDateKey('2026-02-30')).toThrow();
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true);
    expect(isValidTimeZone('Not/A_Zone')).toBe(false);
    expect(isValidTimeZone('+08:00')).toBe(false);
  });
});
