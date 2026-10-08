/**
 * 重复项目（recurring-projects spec）：派生、完成时的剩余任务、跳过本次、
 * 写入规则与合并后修复。
 */

import { describe, expect, it } from 'vitest';

import {
  deriveRepeatCopyId,
  deriveRepeatProjectId,
  planProjectComplete,
  planProjectRepeatSkip,
  planProjectUpdate,
  planRepeatProjectInstance,
  projectUpdatePutsBack,
  repairEntity,
} from '../src/index';

const UTC = { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };
const WEEKLY = { unit: 'week', interval: 1, anchor: 'scheduled' } as const;
const REVIEW = {
  today: '2026-10-05',
  defaults: {
    project: { unit: 'week', count: 1 },
    area: { unit: 'month', count: 1 },
  },
} as const;

const parent = {
  id: 'project-1',
  title: 'Weekly review',
  notes: 'checklist',
  scheduledDate: '2026-10-05',
  dueDate: '2026-10-07',
  repeatRule: WEEKLY,
  reviewInterval: { unit: 'month', count: 1 },
  areaId: 'area-1',
  tagIds: ['tag-1'],
};

const task = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: id,
  notes: null,
  scheduledType: 'NONE',
  scheduledDate: null,
  dueDate: null,
  reminderTime: null,
  repeatRule: null,
  repeatSourceId: null,
  bucket: 'ANYTIME',
  status: 'ACTIVE',
  trashedAt: null,
  headingId: null,
  areaId: null,
  tagIds: [] as string[],
  position: 'a0',
  ...overrides,
});

describe('重复项目派生', () => {
  it('项目：确定性 id、计划到下一次、截止日期平移，复制标题 / 备注 / 标签 / 区域 / 规则 / 回顾间隔', () => {
    const plan = planRepeatProjectInstance(parent, '2026-10-05T10:00:00.000Z', UTC, REVIEW)!;
    expect(plan.id).toBe(deriveRepeatProjectId('project-1', WEEKLY, '2026-10-12'));
    expect(plan.project).toEqual({
      title: 'Weekly review',
      notes: 'checklist',
      scheduledType: 'DATE',
      scheduledDate: '2026-10-12',
      dueDate: '2026-10-14',
      repeatRule: WEEKLY,
      repeatSourceId: 'project-1',
      // 沿用来源的回顾间隔，下次回顾日从派生日重新计
      reviewInterval: { unit: 'month', count: 1 },
      nextReviewDate: '2026-11-05',
      lastReviewedOn: null,
      bucket: 'SCHEDULED',
      status: 'ACTIVE',
      completedAt: null,
      trashedAt: null,
      areaId: 'area-1',
      tagIds: ['tag-1'],
    });
  });

  it('无规则或链已终结（until）不派生', () => {
    expect(planRepeatProjectInstance({ ...parent, repeatRule: null }, 'x', UTC, REVIEW)).toBeNull();
    expect(
      planRepeatProjectInstance(
        { ...parent, repeatRule: { ...WEEKLY, until: '2026-10-10' } },
        '2026-10-05T10:00:00.000Z',
        UTC,
        REVIEW,
      ),
    ).toBeNull();
  });

  it('副本：Headings / 任务 / Subtask 全部重置为未完成，日期平移，分组映射，排除 Trash 与项目内链的后代', () => {
    const plan = planRepeatProjectInstance(parent, '2026-10-05T10:00:00.000Z', UTC, REVIEW)!;
    const copy = plan.copyFor('next', {
      headings: [{ id: 'h1', title: 'Prep', position: 'a0' }],
      tasks: [
        task('done', { status: 'COMPLETED', headingId: 'h1', position: 'a1' }),
        task('cancelled', { status: 'CANCELLED', position: 'a2' }),
        task('dated', {
          scheduledType: 'DATE',
          scheduledDate: '2026-10-06',
          dueDate: '2026-10-08',
          reminderTime: '09:00',
          bucket: 'SCHEDULED',
          repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
          position: 'a3',
        }),
        // 项目内重复链的后代：只复制源头 dated
        task('dated-next', {
          status: 'COMPLETED',
          scheduledType: 'DATE',
          scheduledDate: '2026-10-07',
          repeatSourceId: 'dated',
          position: 'a4',
        }),
        task('trashed', { trashedAt: '2026-10-04T00:00:00.000Z' }),
        task('someday', { scheduledType: 'SOMEDAY', bucket: 'SCHEDULED', position: 'a5' }),
      ],
      subtasks: [
        { id: 's1', title: 'step', taskId: 'done', position: 'a0' },
        { id: 's2', title: 'gone', taskId: 'trashed', position: 'a0' },
      ],
      attachments: [
        {
          id: 'f1',
          taskId: 'done',
          name: 'plan.pdf',
          mimeType: 'application/pdf',
          size: 3,
          blobHash: 'h',
          position: 'a0',
        },
        {
          id: 'f2',
          taskId: 'trashed',
          name: 'gone.pdf',
          mimeType: 'application/pdf',
          size: 3,
          blobHash: 'g',
          position: 'a0',
        },
      ],
    });

    expect(copy.headings).toEqual([
      expect.objectContaining({ title: 'Prep', status: 'ACTIVE', projectId: 'next' }),
    ]);
    expect(copy.tasks.map((t) => t.title)).toEqual(['done', 'cancelled', 'dated', 'someday']);
    for (const t of copy.tasks) {
      expect(t).toMatchObject({
        status: 'ACTIVE',
        settledAt: null,
        trashedAt: null,
        projectId: 'next',
        repeatSourceId: null,
      });
    }
    const [done, , dated, someday] = copy.tasks;
    expect(done.headingId).toBe(copy.headings[0].id);
    expect(dated).toMatchObject({
      scheduledDate: '2026-10-13',
      dueDate: '2026-10-15',
      reminderTime: '09:00',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
      bucket: 'SCHEDULED',
    });
    expect(someday).toMatchObject({ scheduledType: 'SOMEDAY', scheduledDate: null });
    expect(copy.subtasks).toEqual([
      {
        id: expect.any(String),
        title: 'step',
        taskId: done.id,
        position: 'a0',
        status: 'ACTIVE',
        settledAt: null,
      },
    ]);
    // 附件随任务复制（Trash 中任务的不复制），指向同一 Blob
    expect(copy.attachments).toEqual([
      {
        id: deriveRepeatCopyId('next', 'attachment', 'f1'),
        taskId: done.id,
        name: 'plan.pdf',
        mimeType: 'application/pdf',
        size: 3,
        blobHash: 'h',
        position: 'a0',
      },
    ]);
  });

  it('副本 id 按来源 id 派生：同一来源在两端得到同一 id，与列表中其余行无关', () => {
    const plan = planRepeatProjectInstance(parent, '2026-10-05T10:00:00.000Z', UTC, REVIEW)!;
    const a = plan.copyFor('next', { headings: [], tasks: [task('t1')], subtasks: [] });
    const b = plan.copyFor('next', {
      headings: [],
      tasks: [task('t0', { position: 'Z' }), task('t1')],
      subtasks: [],
    });
    expect(b.tasks.find((t) => t.title === 't1')!.id).toBe(a.tasks[0].id);
    // 换新的实例 id（fresh）时子实体 id 随之全新
    const fresh = plan.copyFor('fresh', { headings: [], tasks: [task('t1')], subtasks: [] });
    expect(fresh.tasks[0].id).not.toBe(a.tasks[0].id);
  });
});

describe('完成项目', () => {
  const tasks = [
    { id: 'open', status: 'ACTIVE', trashedAt: null },
    { id: 'done', status: 'COMPLETED', trashedAt: null },
    { id: 'trashed', status: 'ACTIVE', trashedAt: '2026-10-01T00:00:00.000Z' },
  ];
  const now = '2026-10-05T10:00:00.000Z';

  it('缺省不动任务；settleRemaining 只了结未了结、未进 Trash 的任务', () => {
    expect(planProjectComplete('ACTIVE', now, tasks)).toEqual({
      project: { status: 'COMPLETED', completedAt: now },
      tasks: [],
      deriveRepeat: true,
    });
    expect(planProjectComplete('ACTIVE', now, tasks, 'cancelled')!.tasks).toEqual([
      { id: 'open', patch: { status: 'CANCELLED', settledAt: now, reminderTime: null } },
    ]);
    expect(planProjectComplete('ACTIVE', now, tasks, 'completed')!.tasks).toEqual([
      { id: 'open', patch: { status: 'COMPLETED', settledAt: now, reminderTime: null } },
    ]);
  });

  it('已完成的项目再次完成不改写、不派生', () => {
    expect(planProjectComplete('COMPLETED', now, tasks, 'completed')).toBeNull();
  });
});

describe('重复项目跳过本次', () => {
  const now = '2026-10-05T10:00:00.000Z';
  const project = {
    status: 'ACTIVE',
    trashedAt: null,
    scheduledType: 'DATE',
    scheduledDate: '2026-10-05',
    dueDate: '2026-10-07',
    repeatRule: WEEKLY,
  };
  const tasks = [
    {
      id: 'open',
      status: 'ACTIVE',
      trashedAt: null,
      scheduledType: 'DATE',
      scheduledDate: '2026-10-06',
      dueDate: '2026-10-08',
    },
    {
      id: 'no-dates',
      status: 'ACTIVE',
      trashedAt: null,
      scheduledType: 'NONE',
      scheduledDate: null,
      dueDate: null,
    },
    {
      id: 'done',
      status: 'COMPLETED',
      trashedAt: null,
      scheduledType: 'DATE',
      scheduledDate: '2026-10-05',
      dueDate: null,
    },
  ];

  it('项目推进到下一次；未了结任务的日期同步平移，已了结的不动', () => {
    expect(planProjectRepeatSkip(project, tasks, false, now, UTC)).toEqual({
      project: { scheduledDate: '2026-10-12', dueDate: '2026-10-14' },
      tasks: [{ id: 'open', patch: { scheduledDate: '2026-10-13', dueDate: '2026-10-15' } }],
    });
  });

  it('不可跳过：非重复 / 已完成 / 下一轮已存在 / 链已到头', () => {
    expect(planProjectRepeatSkip({ ...project, repeatRule: null }, [], false, now, UTC)).toEqual({
      blocked: 'not-repeating',
    });
    expect(planProjectRepeatSkip({ ...project, status: 'COMPLETED' }, [], false, now, UTC)).toEqual(
      { blocked: 'not-active' },
    );
    expect(planProjectRepeatSkip(project, [], true, now, UTC)).toEqual({
      blocked: 'next-exists',
    });
    expect(
      planProjectRepeatSkip(
        { ...project, repeatRule: { ...WEEKLY, until: '2026-10-10' } },
        [],
        false,
        now,
        UTC,
      ),
    ).toEqual({ blocked: 'no-next' });
  });
});

describe('项目的重复规则写入与修复', () => {
  const base = { scheduledType: 'DATE', scheduledDate: '2026-10-05', bucket: 'SCHEDULED' };

  it('DATE 项目可设规则（规范化），离开 DATE 清除', () => {
    expect(
      planProjectUpdate(base, { repeatRule: { ...WEEKLY, weekdays: [3, 1, 1] } }, UTC).repeatRule,
    ).toEqual({ ...WEEKLY, weekdays: [1, 3] });
    expect(planProjectUpdate(base, { repeatRule: null }, UTC).repeatRule).toBeNull();
    expect(
      planProjectUpdate(base, { scheduledType: 'SOMEDAY' as never }, UTC).repeatRule,
    ).toBeNull();
    expect(projectUpdatePutsBack({ repeatRule: WEEKLY })).toBe(true);
  });

  it('合并后修复：非 DATE 项目上的规则被清除', () => {
    expect(
      repairEntity('project', {
        scheduledType: 'SOMEDAY',
        repeatRule: WEEKLY,
        bucket: 'SCHEDULED',
      }),
    ).toEqual({ repeatRule: null });
    expect(
      repairEntity('project', {
        scheduledType: 'DATE',
        scheduledDate: '2026-10-05',
        repeatRule: WEEKLY,
        bucket: 'SCHEDULED',
      }),
    ).toEqual({});
  });
});
