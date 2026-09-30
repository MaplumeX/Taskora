import { describe, expect, it } from 'vitest';

import { ScheduledType, TaskStatus } from '@taskora/shared';

import { resolveReminderAction, type ReminderActionRequest } from './reminder-action';
import { reminderFireAt, snoozeTomorrowAt, type ReminderTaskInput } from '@taskora/engine';

const SHANGHAI = 'Asia/Shanghai';
const NEW_YORK = 'America/New_York';

function task(partial: Partial<ReminderTaskInput> = {}): ReminderTaskInput {
  return {
    id: 't1',
    title: '任务',
    scheduledType: ScheduledType.DATE,
    scheduledDate: '2026-02-05',
    reminderTime: '09:00',
    status: TaskStatus.ACTIVE,
    trashedAt: null,
    ...partial,
  };
}

/** 以任务当前提醒为快照的请求（未过期）。 */
function request(
  t: ReminderTaskInput,
  action: ReminderActionRequest['action'],
  tappedAt: string,
  timeZone: string,
): ReminderActionRequest {
  return {
    taskId: t.id,
    action,
    firedFireAt: reminderFireAt(t.scheduledDate!, t.reminderTime!, timeZone)!,
    tappedAt: Date.parse(tappedAt),
  };
}

describe('resolveReminderAction — 完成', () => {
  it('以点击时刻为了结时间', () => {
    const t = task();
    const result = resolveReminderAction(
      t,
      request(t, 'complete', '2026-02-05T01:03:20.000Z', SHANGHAI),
      SHANGHAI,
    );
    expect(result).toEqual({ kind: 'complete', settledAt: '2026-02-05T01:03:20.000Z' });
  });
});

describe('resolveReminderAction — Snooze 目标时刻（账号时区）', () => {
  it('15 分钟：点击时刻 + 15 分钟，向上取整到分钟', () => {
    const t = task();
    // 上海 09:00:20 点击 → 09:15:20 → 取整 09:16
    const result = resolveReminderAction(
      t,
      request(t, 'snooze15', '2026-02-05T01:00:20.000Z', SHANGHAI),
      SHANGHAI,
    );
    expect(result).toEqual({ kind: 'snooze', scheduledDate: '2026-02-05', reminderTime: '09:16' });
  });

  it('整分钟点击不额外进位', () => {
    const t = task();
    const result = resolveReminderAction(
      t,
      request(t, 'snooze60', '2026-02-05T01:00:00.000Z', SHANGHAI),
      SHANGHAI,
    );
    expect(result).toEqual({ kind: 'snooze', scheduledDate: '2026-02-05', reminderTime: '10:00' });
  });

  it('跨午夜：计划日期随之变为次日', () => {
    const t = task({ reminderTime: '23:30' });
    // 上海 23:50 点击 → 次日 00:05
    const result = resolveReminderAction(
      t,
      request(t, 'snooze15', '2026-02-05T15:50:00.000Z', SHANGHAI),
      SHANGHAI,
    );
    expect(result).toEqual({ kind: 'snooze', scheduledDate: '2026-02-06', reminderTime: '00:05' });
  });

  it('明天：账号时区点击日 + 1，保留当前提醒时刻（不看设备/UTC 日期）', () => {
    const t = task({ reminderTime: '23:30' });
    // UTC 仍是 2月5日 16:10，但上海已是 2月6日 00:10 → 明天 = 2月7日
    const result = resolveReminderAction(
      t,
      request(t, 'snoozeTomorrow', '2026-02-05T16:10:00.000Z', SHANGHAI),
      SHANGHAI,
    );
    expect(result).toEqual({ kind: 'snooze', scheduledDate: '2026-02-07', reminderTime: '23:30' });
  });

  it('DST 跳变：15 分钟跨过纽约夏令时起点，按墙上时刻落到 03:05', () => {
    const t = task({ scheduledDate: '2026-03-08', reminderTime: '01:45' });
    // 01:50 EST = 06:50Z → +15min = 07:05Z = 03:05 EDT
    const result = resolveReminderAction(
      t,
      request(t, 'snooze15', '2026-03-08T06:50:00.000Z', NEW_YORK),
      NEW_YORK,
    );
    expect(result).toEqual({ kind: 'snooze', scheduledDate: '2026-03-08', reminderTime: '03:05' });
  });
});

describe('resolveReminderAction — 过期校验（迟到的操作不覆盖别处改动）', () => {
  const tapped = '2026-02-05T01:01:00.000Z';

  it('任务不存在', () => {
    const snapshot = request(task(), 'complete', tapped, SHANGHAI);
    expect(resolveReminderAction(null, snapshot, SHANGHAI)).toEqual({
      kind: 'discard',
      reason: 'missing',
    });
  });

  it.each([
    ['已完成', { status: TaskStatus.COMPLETED }],
    ['已取消', { status: TaskStatus.CANCELLED }],
    ['已进 Trash', { trashedAt: '2026-02-05T00:30:00.000Z' }],
    ['移入 Someday', { scheduledType: ScheduledType.SOMEDAY, scheduledDate: null }],
    ['关掉提醒', { reminderTime: null }],
  ] as const)('%s → 丢弃', (_label, change) => {
    const snapshot = request(task(), 'snooze15', tapped, SHANGHAI);
    expect(resolveReminderAction(task(change), snapshot, SHANGHAI)).toEqual({
      kind: 'discard',
      reason: 'ineligible',
    });
  });

  it.each([
    ['别处改期', { scheduledDate: '2026-02-06' }],
    ['别处改提醒时刻', { reminderTime: '10:00' }],
  ] as const)('%s → 丢弃（fireAt 与通知快照不一致）', (_label, change) => {
    for (const action of ['complete', 'snooze15', 'snoozeTomorrow'] as const) {
      const snapshot = request(task(), action, tapped, SHANGHAI);
      expect(resolveReminderAction(task(change), snapshot, SHANGHAI)).toEqual({
        kind: 'discard',
        reason: 'stale',
      });
    }
  });

  it('重放已应用的 Snooze：任务提醒已被改写 → 丢弃（幂等）', () => {
    const before = task();
    const snapshot = request(before, 'snooze15', tapped, SHANGHAI);
    const first = resolveReminderAction(before, snapshot, SHANGHAI);
    expect(first.kind).toBe('snooze');
    if (first.kind !== 'snooze') return;
    const after = task({ scheduledDate: first.scheduledDate, reminderTime: first.reminderTime });
    expect(resolveReminderAction(after, snapshot, SHANGHAI)).toEqual({
      kind: 'discard',
      reason: 'stale',
    });
  });
});

describe('snoozeTomorrowAt — 原生临时「明天」闹钟时刻', () => {
  it('触发日 + 1 的同一墙上时刻（跨 DST 不是固定 24h）', () => {
    const fireAt = reminderFireAt('2026-03-07', '09:00', NEW_YORK)!;
    expect(snoozeTomorrowAt(fireAt, NEW_YORK)).toBe(Date.parse('2026-03-08T13:00:00.000Z'));
    expect(snoozeTomorrowAt(fireAt, NEW_YORK) - fireAt).toBe(23 * 3600_000);
  });
});
