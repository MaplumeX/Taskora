/**
 * 出现日（Occurrence Date，recurring-tasks-v4）：改期即例外、更新规则、
 * 推算 / 跳过 / 派生 / 预告按出现日、合并后修复。
 * 2026-10-05 是周一。
 */

import { describe, expect, it } from 'vitest';

import type { RepeatRule } from '@taskora/shared';

import {
  buildRepeatPreviews,
  nextCopyBlock,
  nextOccurrenceDate,
  planProjectRepeatSkip,
  planProjectUpdate,
  planRepeatInstance,
  planRepeatProjectInstance,
  planRepeatSkip,
  planTaskDuplicate,
  planTaskUpdate,
  projectNextCopyBlock,
  repairEntity,
  retargetRepeatRule,
  skipOccurrenceDate,
} from '../src/index';

const UTC = { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };
const REVIEW = {
  today: '2026-10-05',
  defaults: {
    project: { unit: 'week', count: 1 },
    area: { unit: 'month', count: 1 },
  },
} as const;

const WEEKLY: RepeatRule = { unit: 'week', interval: 1, anchor: 'scheduled' };
const MONDAYS: RepeatRule = { unit: 'week', interval: 1, weekdays: [1], anchor: 'scheduled' };
const EVERY_3_DAYS: RepeatRule = { unit: 'day', interval: 3, anchor: 'scheduled' };
const AFTER_3_DAYS: RepeatRule = { unit: 'day', interval: 3, anchor: 'completion' };

describe('nextOccurrenceDate — 出现日', () => {
  it('从出现日推算：周一的「每 1 周」挪到周二，下一次仍是下周一', () => {
    expect(
      nextOccurrenceDate(WEEKLY, { scheduledDate: '2026-10-06', occurrenceDate: '2026-10-05' }),
    ).toBe('2026-10-12');
    expect(
      nextOccurrenceDate(EVERY_3_DAYS, {
        scheduledDate: '2026-10-06',
        occurrenceDate: '2026-10-05',
      }),
    ).toBe('2026-10-08');
  });

  it('提前挪：下一次仍从出现日推算', () => {
    expect(
      nextOccurrenceDate(MONDAYS, { scheduledDate: '2026-10-02', occurrenceDate: '2026-10-05' }),
    ).toBe('2026-10-12');
  });

  it('例外挪到下一次之后：越过的出现日一并跳过，结果晚于计划日期', () => {
    expect(
      nextOccurrenceDate(MONDAYS, { scheduledDate: '2026-10-14', occurrenceDate: '2026-10-05' }),
    ).toBe('2026-10-19');
    // 恰好挪到下一次当天也越过
    expect(
      nextOccurrenceDate(MONDAYS, { scheduledDate: '2026-10-12', occurrenceDate: '2026-10-05' }),
    ).toBe('2026-10-19');
  });

  it('until 在越过之后的出现日之前：链终结', () => {
    expect(
      nextOccurrenceDate(
        { ...MONDAYS, until: '2026-10-15' },
        { scheduledDate: '2026-10-14', occurrenceDate: '2026-10-05' },
      ),
    ).toBeNull();
  });

  it('anchor=completion 不看出现日', () => {
    expect(
      nextOccurrenceDate(AFTER_3_DAYS, {
        scheduledDate: '2026-10-06',
        occurrenceDate: '2026-10-05',
        settledAt: '2026-10-10T08:00:00.000Z',
      }),
    ).toBe('2026-10-13');
  });

  it('无出现日时行为不变', () => {
    expect(nextOccurrenceDate(WEEKLY, { scheduledDate: '2026-10-06' })).toBe('2026-10-13');
  });
});

describe('skipOccurrenceDate — 出现日', () => {
  it('从出现日推进到晚于计划日期、不早于今天的出现日', () => {
    expect(
      skipOccurrenceDate(MONDAYS, {
        scheduledDate: '2026-10-06',
        occurrenceDate: '2026-10-05',
        now: '2026-10-04T08:00:00.000Z',
      }),
    ).toBe('2026-10-12');
    expect(
      skipOccurrenceDate(MONDAYS, {
        scheduledDate: '2026-10-14',
        occurrenceDate: '2026-10-05',
        now: '2026-10-04T08:00:00.000Z',
      }),
    ).toBe('2026-10-19');
  });
});

describe('retargetRepeatRule', () => {
  it('单个星期几换成新日期的星期几', () => {
    expect(retargetRepeatRule(MONDAYS, '2026-10-05', '2026-10-06')).toEqual({
      ...MONDAYS,
      weekdays: [2],
    });
  });

  it('多个星期几只替换被挪的那天', () => {
    const rule: RepeatRule = {
      unit: 'week',
      interval: 2,
      weekdays: [1, 3, 5],
      anchor: 'scheduled',
    };
    expect(retargetRepeatRule(rule, '2026-10-05', '2026-10-06')).toEqual({
      ...rule,
      weekdays: [2, 3, 5],
    });
    // 挪到集合里已有的一天：合并
    expect(retargetRepeatRule(rule, '2026-10-05', '2026-10-07')).toEqual({
      ...rule,
      weekdays: [3, 5],
    });
  });

  it('出现日不在集合中：只加入新的星期几', () => {
    expect(retargetRepeatRule(MONDAYS, '2026-10-07', '2026-10-09')).toEqual({
      ...MONDAYS,
      weekdays: [1, 5],
    });
  });

  it('月的日子只替换被挪的那天', () => {
    const rule: RepeatRule = {
      unit: 'month',
      interval: 1,
      monthDays: [1, 15],
      anchor: 'scheduled',
    };
    expect(retargetRepeatRule(rule, '2026-10-01', '2026-10-03')).toEqual({
      ...rule,
      monthDays: [3, 15],
    });
  });

  it('月的日子按钳制识别被挪的那天（[31] 在二月的 28 号）', () => {
    const rule: RepeatRule = {
      unit: 'month',
      interval: 1,
      monthDays: [15, 31],
      anchor: 'scheduled',
    };
    expect(retargetRepeatRule(rule, '2027-02-28', '2027-02-26')).toEqual({
      ...rule,
      monthDays: [15, 26],
    });
  });

  it('无星期几 / 日子的规则不变；interval / until 保留', () => {
    const rule: RepeatRule = { ...WEEKLY, interval: 2, until: '2027-01-01' };
    expect(retargetRepeatRule(rule, '2026-10-05', '2026-10-06')).toEqual(rule);
    expect(retargetRepeatRule(EVERY_3_DAYS, '2026-10-05', '2026-10-06')).toEqual(EVERY_3_DAYS);
  });
});

describe('planTaskUpdate — 出现日写入', () => {
  const base = {
    start: 'ANYTIME',
    scheduledDate: '2026-10-05',
    projectId: null,
    areaId: null,
    headingId: null,
    repeatRule: MONDAYS,
  };

  it('改期（不写规则）：保留原出现日', () => {
    expect(planTaskUpdate(base, { scheduledDate: '2026-10-06' }, UTC)).toMatchObject({
      scheduledDate: '2026-10-06',
      occurrenceDate: '2026-10-05',
    });
  });

  it('已是例外再改期：出现日不变（不写）', () => {
    const patch = planTaskUpdate(
      { ...base, scheduledDate: '2026-10-06', occurrenceDate: '2026-10-05' },
      { scheduledDate: '2026-10-07' },
      UTC,
    );
    expect(patch.scheduledDate).toBe('2026-10-07');
    expect(patch).not.toHaveProperty('occurrenceDate');
  });

  it('挪回原定那天：出现日清空', () => {
    expect(
      planTaskUpdate(
        { ...base, scheduledDate: '2026-10-06', occurrenceDate: '2026-10-05' },
        { scheduledDate: '2026-10-05' },
        UTC,
      ),
    ).toMatchObject({ scheduledDate: '2026-10-05', occurrenceDate: null });
  });

  it('同次写了规则（更新规则）：出现日清空', () => {
    const patch = planTaskUpdate(
      { ...base, scheduledDate: '2026-10-06', occurrenceDate: '2026-10-05' },
      { scheduledDate: '2026-10-07', repeatRule: { ...MONDAYS, weekdays: [3] } },
      UTC,
    );
    expect(patch).toMatchObject({ scheduledDate: '2026-10-07', occurrenceDate: null });
  });

  it('同次写了规则但原本没有出现日：不写出现日', () => {
    const patch = planTaskUpdate(base, { scheduledDate: '2026-10-07', repeatRule: MONDAYS }, UTC);
    expect(patch).not.toHaveProperty('occurrenceDate');
  });

  it('清除日期 / Someday：出现日清空', () => {
    const existing = { ...base, scheduledDate: '2026-10-06', occurrenceDate: '2026-10-05' };
    expect(planTaskUpdate(existing, { scheduledDate: null }, UTC)).toMatchObject({
      occurrenceDate: null,
      repeatRule: null,
    });
    expect(planTaskUpdate(existing, { start: 'SOMEDAY' as never }, UTC)).toMatchObject({
      occurrenceDate: null,
    });
  });

  it('anchor=completion、无规则、同一天：不写出现日', () => {
    for (const repeatRule of [AFTER_3_DAYS, null]) {
      const patch = planTaskUpdate({ ...base, repeatRule }, { scheduledDate: '2026-10-06' }, UTC);
      expect(patch).not.toHaveProperty('occurrenceDate');
    }
    expect(planTaskUpdate(base, { scheduledDate: '2026-10-05' }, UTC)).not.toHaveProperty(
      'occurrenceDate',
    );
  });

  it('只改标题：不动出现日', () => {
    expect(
      planTaskUpdate({ ...base, occurrenceDate: '2026-10-04' }, { title: 'x' }, UTC),
    ).not.toHaveProperty('occurrenceDate');
  });
});

describe('planProjectUpdate — 出现日写入', () => {
  const base = {
    start: 'ANYTIME',
    scheduledDate: '2026-10-05',
    repeatRule: WEEKLY,
    reviewInterval: null,
    nextReviewDate: null,
    lastReviewedOn: null,
    createdAt: '2026-10-01T00:00:00.000Z',
  };

  it('改期即例外，写了规则即清空', () => {
    expect(planProjectUpdate(base, { scheduledDate: '2026-10-06' }, UTC, REVIEW)).toMatchObject({
      occurrenceDate: '2026-10-05',
    });
    expect(
      planProjectUpdate(
        { ...base, scheduledDate: '2026-10-06', occurrenceDate: '2026-10-05' },
        { scheduledDate: '2026-10-06', repeatRule: WEEKLY },
        UTC,
        REVIEW,
      ),
    ).toMatchObject({ occurrenceDate: null });
  });
});

describe('派生 / 跳过 / 预告按出现日', () => {
  const parent = {
    id: 'task-1',
    title: 'Standup notes',
    notes: null,
    scheduledDate: '2026-10-06',
    occurrenceDate: '2026-10-05',
    dueDate: '2026-10-07',
    repeatRule: WEEKLY,
    reminderTime: null,
    projectId: null,
    headingId: null,
    areaId: null,
    tagIds: [],
  };

  it('完成派生：下一次从出现日推算，截止日期保持相对出现日的提前量，实例无出现日', () => {
    const plan = planRepeatInstance(parent, [], '2026-10-06T10:00:00.000Z', UTC)!;
    expect(plan.task).toMatchObject({
      scheduledDate: '2026-10-12',
      dueDate: '2026-10-14',
      occurrenceDate: null,
    });
  });

  it('跳过：计划到下一次、出现日清空、截止日期按出现日平移', () => {
    const plan = planRepeatSkip(
      { ...parent, status: 'ACTIVE', trashedAt: null },
      false,
      '2026-10-05T08:00:00.000Z',
      UTC,
    );
    expect(plan).toEqual({
      patch: { scheduledDate: '2026-10-12', occurrenceDate: null, dueDate: '2026-10-14' },
      ends: false,
    });
  });

  it('预告：按出现日推算下一次', () => {
    const previews = buildRepeatPreviews([{ ...parent, status: 'ACTIVE', trashedAt: null }], {
      ...UTC,
      now: '2026-10-05T08:00:00.000Z',
    });
    expect(previews.map((preview) => preview.dateKey)).toEqual(['2026-10-12']);
  });

  it('复制照抄出现日', () => {
    const plan = planTaskDuplicate({ ...parent, start: 'ANYTIME' }, [], [], UTC);
    expect(plan.task.occurrenceDate).toBe('2026-10-05');
  });

  const project = {
    id: 'project-1',
    title: 'Weekly review',
    notes: null,
    scheduledDate: '2026-10-06',
    occurrenceDate: '2026-10-05',
    dueDate: '2026-10-07',
    repeatRule: WEEKLY,
    reviewInterval: null,
    areaId: null,
    tagIds: [],
  };

  it('重复项目派生：从出现日推算，平移以出现日为基准', () => {
    const plan = planRepeatProjectInstance(project, '2026-10-06T10:00:00.000Z', UTC, REVIEW)!;
    expect(plan.project).toMatchObject({
      scheduledDate: '2026-10-12',
      dueDate: '2026-10-14',
      occurrenceDate: null,
    });
    const copy = plan.copyFor('next', {
      headings: [],
      subtasks: [],
      tasks: [
        {
          id: 't1',
          title: 't1',
          notes: null,
          start: 'ANYTIME',
          scheduledDate: '2026-10-05',
          dueDate: null,
          reminderTime: null,
          repeatRule: null,
          repeatSourceId: null,
          trashedAt: null,
          headingId: null,
          areaId: null,
          tagIds: [],
          position: 'a0',
        },
      ],
    });
    expect(copy.tasks[0]).toMatchObject({ scheduledDate: '2026-10-12', occurrenceDate: null });
  });

  it('重复项目跳过：项目出现日清空，项目内任务按出现日基准平移', () => {
    const plan = planProjectRepeatSkip(
      { ...project, status: 'ACTIVE', trashedAt: null },
      [
        {
          id: 't1',
          status: 'ACTIVE',
          trashedAt: null,
          scheduledDate: '2026-10-05',
          dueDate: null,
        },
      ],
      false,
      '2026-10-05T08:00:00.000Z',
      UTC,
    );
    expect(plan).toEqual({
      project: { scheduledDate: '2026-10-12', occurrenceDate: null, dueDate: '2026-10-14' },
      tasks: [{ id: 't1', patch: { scheduledDate: '2026-10-12' } }],
    });
  });
});

describe('repairEntity — 出现日', () => {
  const task = (overrides: Record<string, unknown>) => ({
    start: 'ANYTIME',
    scheduledDate: '2026-10-06',
    repeatRule: WEEKLY,
    reminderTime: null,
    occurrenceDate: '2026-10-05',
    projectId: null,
    areaId: null,
    headingId: null,
    status: 'ACTIVE',
    settledAt: null,
    ...overrides,
  });

  it('一致的状态不修', () => {
    expect(repairEntity('task', task({}))).toEqual({});
  });

  it('规则被清除或改为 anchor=completion：出现日清空', () => {
    expect(repairEntity('task', task({ repeatRule: null }))).toEqual({ occurrenceDate: null });
    expect(repairEntity('task', task({ repeatRule: AFTER_3_DAYS }))).toEqual({
      occurrenceDate: null,
    });
  });

  it('Someday：日期、规则与出现日一起清空', () => {
    expect(repairEntity('task', task({ start: 'SOMEDAY' }))).toMatchObject({
      scheduledDate: null,
      repeatRule: null,
      occurrenceDate: null,
    });
  });

  it('项目同一规则', () => {
    expect(
      repairEntity('project', {
        start: 'ANYTIME',
        scheduledDate: '2026-10-06',
        repeatRule: null,
        occurrenceDate: '2026-10-05',
        status: 'ACTIVE',
        completedAt: null,
      }),
    ).toEqual({ occurrenceDate: null });
  });
});

describe('提前生成下一份 — 阻断原因（nextCopyBlock）', () => {
  const source = {
    id: 'task-1',
    status: 'ACTIVE',
    trashedAt: null,
    scheduledDate: '2026-10-05',
    repeatRule: WEEKLY,
  };
  const now = '2026-10-04T08:00:00.000Z';

  it('可用：null', () => {
    expect(nextCopyBlock(source, false, now, UTC)).toBeNull();
  });

  it('无规则 / 已了结 / 已生成过 / 链已终结', () => {
    expect(nextCopyBlock({ ...source, repeatRule: null }, false, now, UTC)).toBe('not-repeating');
    expect(nextCopyBlock({ ...source, status: 'COMPLETED' }, false, now, UTC)).toBe('not-active');
    expect(nextCopyBlock(source, true, now, UTC)).toBe('next-exists');
    expect(
      nextCopyBlock({ ...source, repeatRule: { ...WEEKLY, until: '2026-10-06' } }, false, now, UTC),
    ).toBe('no-next');
  });

  it('项目：ACTIVE 即未完成', () => {
    expect(projectNextCopyBlock(source, false, now, UTC)).toBeNull();
    expect(projectNextCopyBlock({ ...source, status: 'COMPLETED' }, false, now, UTC)).toBe(
      'not-active',
    );
  });

  it('下一份与完成时派生的是同一个实例（同一确定性 id）', () => {
    const parent = {
      ...source,
      title: 't',
      notes: null,
      dueDate: null,
      reminderTime: null,
      projectId: null,
      headingId: null,
      areaId: null,
      tagIds: [],
    };
    const early = planRepeatInstance(parent, [], now, UTC)!;
    const atCompletion = planRepeatInstance(parent, [], '2026-10-05T18:00:00.000Z', UTC)!;
    expect(early.id).toBe(atCompletion.id);
  });
});
