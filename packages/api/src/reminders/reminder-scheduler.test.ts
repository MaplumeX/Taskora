import { describe, expect, it } from 'vitest';

import { ScheduledType, TaskStatus } from '@taskora/shared';

import {
  computeReminderPlan,
  diffReminderRegistration,
  reminderNotificationKey,
  type ReminderTaskInput,
} from './reminder-scheduler';

/** 2026-02-05 是周四。UTC 时区语义：fireAt = 计划日当天 + HH:mm。 */
const SCHEDULED_DATE = '2026-02-05';

function task(partial: Partial<ReminderTaskInput> & { id: string }): ReminderTaskInput {
  return {
    title: partial.title ?? '任务',
    scheduledType: ScheduledType.DATE,
    scheduledDate: partial.scheduledDate ?? SCHEDULED_DATE,
    reminderTime: partial.reminderTime ?? '09:00',
    status: TaskStatus.ACTIVE,
    trashedAt: null,
    ...partial,
  };
}

/** 以固定「当天」构造 now，避免跨日午夜边界导致 CI 偶发。 */
const NOW = new Date(Date.UTC(2026, 1, 4, 12, 0, 0)); // 2026-02-04 12:00 UTC

describe('computeReminderPlan — 纯调度计算（reminders spec 新 seam）', () => {
  it('合格的 DATE 任务产出一条通知：fireAt = 计划日当天 + reminderTime（UTC 时区）', () => {
    const plan = computeReminderPlan(
      [task({ id: 't1', title: '看牙医', reminderTime: '18:30' })],
      NOW,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      key: reminderNotificationKey('t1'),
      taskId: 't1',
      taskTitle: '看牙医',
      fireAt: new Date(Date.UTC(2026, 1, 5, 18, 30, 0)).getTime(),
    });
  });

  it('过滤：非 DATE / 无日期 / 无提醒时刻 / 已了结 / 已进 Trash 的任务不产出', () => {
    const plan = computeReminderPlan(
      [
        task({ id: 'a', scheduledType: ScheduledType.SOMEDAY }),
        task({ id: 'b', scheduledType: ScheduledType.NONE }),
        task({ id: 'c', scheduledDate: null }),
        task({ id: 'd', reminderTime: null }),
        task({ id: 'e', status: TaskStatus.COMPLETED }),
        task({ id: 'f', status: TaskStatus.CANCELLED }),
        task({ id: 'g', trashedAt: '2026-02-01T00:00:00.000Z' }),
        task({ id: 'h', reminderTime: '9:00' }), // 非法格式静默忽略
        task({ id: 'i', reminderTime: '25:00' }),
      ],
      NOW,
    );
    expect(plan.map((n) => n.taskId)).toEqual([]);
  });

  it('过去的提醒时刻（今天已过 / 计划日已过去）静默丢弃，不补发', () => {
    const past = computeReminderPlan(
      [
        // 计划日在 now 之前
        task({ id: 'p1', scheduledDate: '2026-02-03' }),
        // 计划日是今天、提醒时刻早于当前时刻
        task({ id: 'p2', scheduledDate: '2026-02-04', reminderTime: '08:00' }),
      ],
      NOW,
    );
    expect(past).toEqual([]);

    // 同一天但更晚的时刻仍要触发
    const upcoming = computeReminderPlan(
      [task({ id: 'u', scheduledDate: '2026-02-04', reminderTime: '13:30' })],
      NOW,
    );
    expect(upcoming.map((n) => n.taskId)).toEqual(['u']);
  });

  it('同一任务的 key 稳定，可跨重算做 diff；重复 taskId 以最新输入为准', () => {
    const [n1] = computeReminderPlan([task({ id: 't1' })], NOW);
    const [n2] = computeReminderPlan([task({ id: 't1', reminderTime: '10:15' })], NOW);
    expect(n1.key).toBe(n2.key);
    expect(n2.fireAt).toBe(new Date(Date.UTC(2026, 1, 5, 10, 15, 0)).getTime());
  });
});

describe('diffReminderRegistration — 期望集 vs 已注册集 的注册/注销差量', () => {
  const base = task({ id: 't1' });
  const other = task({ id: 't2', reminderTime: '10:00' });

  it('全新任务：全部 register，无 cancel', () => {
    const diff = diffReminderRegistration(new Map(), computeReminderPlan([base, other], NOW));
    expect(diff.register.map((n) => n.taskId)).toEqual(['t1', 't2']);
    expect(diff.cancel).toEqual([]);
  });

  it('消失的注册（关闭提醒/了结/进 Trash）→ cancel', () => {
    const registered = new Map([
      ['reminder:t1', 1],
      [reminderNotificationKey('t2'), new Date(Date.UTC(2026, 1, 5, 10, 0, 0)).getTime()],
    ]);
    const diff = diffReminderRegistration(registered, computeReminderPlan([other], NOW));
    expect(diff.register).toEqual([]);
    expect(diff.cancel).toEqual(['reminder:t1']);
  });

  it('fireAt 变化（改时刻/改日期）→ 先 cancel 再 register 同一 key', () => {
    const registered = new Map([
      [reminderNotificationKey('t1'), new Date(Date.UTC(2026, 1, 5, 9, 0, 0)).getTime()],
    ]);
    const diff = diffReminderRegistration(
      registered,
      computeReminderPlan([task({ id: 't1', reminderTime: '19:45' })], NOW),
    );
    expect(diff.cancel).toEqual([reminderNotificationKey('t1')]);
    expect(diff.register.map((n) => n.fireAt)).toEqual([
      new Date(Date.UTC(2026, 1, 5, 19, 45, 0)).getTime(),
    ]);
  });

  it('fireAt 未变：不重复 register 也不 cancel（幂等）', () => {
    const registered = new Map([
      [reminderNotificationKey('t1'), new Date(Date.UTC(2026, 1, 5, 9, 0, 0)).getTime()],
    ]);
    const diff = diffReminderRegistration(
      registered,
      computeReminderPlan([task({ id: 't1', reminderTime: '09:00' })], NOW),
    );
    expect(diff.register).toEqual([]);
    expect(diff.cancel).toEqual([]);
  });
});
