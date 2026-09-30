import { describe, expect, it } from 'vitest';

import { ScheduledType, TaskStatus } from '@taskora/shared';

import {
  buildReminderTexts,
  computeReminderPlan,
  diffReminderRegistration,
  planReminderDeliveries,
  reminderNotificationKey,
  type ReminderNotification,
  type ReminderTaskInput,
} from './reminders';

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
    const future = new Date(Date.UTC(2026, 1, 5, 10, 0, 0)).getTime();
    const registered = new Map([
      ['reminder:t1', future],
      [reminderNotificationKey('t2'), future],
    ]);
    const diff = diffReminderRegistration(
      registered,
      computeReminderPlan([other], NOW),
      NOW.getTime(),
    );
    expect(diff.register).toEqual([]);
    expect(diff.cancel).toEqual(['reminder:t1']);
    expect(diff.due).toEqual([]);
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
    expect(diff.due).toEqual([]);
  });

  it('注册时间已到且未来不再期望：due 而非 cancel（系统排程不能被撤销）', () => {
    const fireAt = new Date(Date.UTC(2026, 1, 5, 9, 0, 0)).getTime();
    const registered = new Map([[reminderNotificationKey('t1'), fireAt]]);
    const diff = diffReminderRegistration(registered, [], fireAt + 30_000);

    expect(diff.register).toEqual([]);
    expect(diff.cancel).toEqual([]);
    expect(diff.due).toEqual([reminderNotificationKey('t1')]);
  });

  it('注册时间在将来且未来不再期望：仍是 cancel（用户变更/任务终态）', () => {
    const fireAt = new Date(Date.UTC(2026, 1, 5, 9, 0, 0)).getTime();
    const registered = new Map([[reminderNotificationKey('t1'), fireAt]]);
    const diff = diffReminderRegistration(registered, [], fireAt - 30_000);

    expect(diff.register).toEqual([]);
    expect(diff.cancel).toEqual([reminderNotificationKey('t1')]);
    expect(diff.due).toEqual([]);
  });
});

describe('buildReminderTexts', () => {
  const notification: ReminderNotification = {
    key: 'reminder:t1',
    taskId: 't1',
    taskTitle: '写周报',
    fireAt: Date.parse('2026-02-05T01:30:00.000Z'), // 上海 09:30
    snoozeTomorrowAt: Date.parse('2026-02-06T01:30:00.000Z'),
  };

  it('无归属、无备注：正文只有时刻', () => {
    expect(
      buildReminderTexts(notification, { parentName: null, notes: null }, 'Asia/Shanghai'),
    ).toEqual({ title: '写周报', body: '09:30' });
  });

  it('有归属：时刻 · 归属名；备注首个非空行另起一行', () => {
    expect(
      buildReminderTexts(
        notification,
        { parentName: '工作', notes: '\n  汇总本周进展  \n第二行' },
        'Asia/Shanghai',
      ),
    ).toEqual({ title: '写周报', body: '09:30 · 工作\n汇总本周进展' });
  });

  it('空白归属名与空白备注视为无', () => {
    expect(
      buildReminderTexts(notification, { parentName: '  ', notes: ' \n ' }, 'Asia/Shanghai'),
    ).toEqual({ title: '写周报', body: '09:30' });
  });

  it('备注首行过长时截断加省略号', () => {
    const { body } = buildReminderTexts(
      notification,
      { parentName: null, notes: '字'.repeat(100) },
      'Asia/Shanghai',
    );
    expect(body).toBe(`09:30\n${'字'.repeat(80)}…`);
  });
});

describe('planReminderDeliveries — 设备与 hub 共用的完整交付计划', () => {
  const zones = { timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' };
  const titles = {
    projects: new Map([['p1', '发布']]),
    areas: new Map([['a1', '工作']]),
  };

  it('期望集附文案：Project 名优先于 Area 名，备注取首行', () => {
    const plan = planReminderDeliveries(
      [
        task({ id: 't1', title: '写周报', projectId: 'p1', areaId: 'a1', notes: '汇总' }),
        task({ id: 't2', title: '复盘', areaId: 'a1', reminderTime: '10:15' }),
        task({ id: 't3', status: TaskStatus.COMPLETED }),
      ],
      NOW,
      zones,
      titles,
    );
    expect(plan).toEqual([
      {
        key: 'reminder:t1',
        taskId: 't1',
        fireAt: Date.parse('2026-02-05T01:00:00.000Z'),
        snoozeTomorrowAt: Date.parse('2026-02-06T01:00:00.000Z'),
        title: '写周报',
        body: '09:00 · 发布\n汇总',
      },
      {
        key: 'reminder:t2',
        taskId: 't2',
        fireAt: Date.parse('2026-02-05T02:15:00.000Z'),
        snoozeTomorrowAt: Date.parse('2026-02-06T02:15:00.000Z'),
        title: '复盘',
        body: '10:15 · 工作',
      },
    ]);
  });

  it('Postgres 形态的计划日（UTC 零点 DateTime）与日期键得到同一时刻', () => {
    const fromKey = planReminderDeliveries([task({ id: 't1' })], NOW, zones, titles);
    const fromStorage = planReminderDeliveries(
      [task({ id: 't1', scheduledDate: '2026-02-05T00:00:00.000Z' })],
      NOW,
      zones,
      titles,
    );
    expect(fromStorage).toEqual(fromKey);
  });
});
